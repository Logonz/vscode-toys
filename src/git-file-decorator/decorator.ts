import * as vscode from "vscode";
import * as childProcess from "child_process";
import { promisify } from "util";
import type { API, Repository } from "./git";

const execFile = promisify(childProcess.execFile);

export const SETTINGS_SECTION = "vstoys.git.fileDecorator";

/** VS Code shrinks change events with more URIs than this to a sample, so larger changes re-query everything instead. */
const MAX_URIS_PER_EVENT = 250;

interface DecoratorSettings {
  readonly enableBadge: boolean;
  readonly enableColor: boolean;
  readonly autoDetectDefaultBranch: boolean;
  readonly targetBranch: string;
}

function readSettings(): DecoratorSettings {
  const config = vscode.workspace.getConfiguration(SETTINGS_SECTION);
  return {
    enableBadge: config.get("enableBadge", true),
    enableColor: config.get("enableColor", true),
    autoDetectDefaultBranch: config.get("autoDetectDefaultBranch", true),
    targetBranch: config.get("targetBranch", "main"),
  };
}

/**
 * Lookup key for a file. VS Code treats file paths as case-insensitive on Windows and macOS,
 * so a tab opened as `d:\projekt\a.ts` must find the decoration computed for `D:\Projekt\a.ts`.
 */
function decorationKey(uri: vscode.Uri): string {
  const key = uri.toString();
  return process.platform === "linux" ? key : key.toLowerCase();
}

/** Runs git without a shell, so paths and branch names need no quoting. Rejects with git's stderr in the message. */
async function runGit(gitPath: string, args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFile(gitPath, args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

/** The files a branch changed since it split off `targetBranch`, minus files with local changes. */
interface BranchComparison {
  readonly targetBranch: string;
  /** Keyed by `decorationKey()`. */
  readonly decoratedFiles: ReadonlyMap<string, vscode.Uri>;
}

/** What a repository's decorations need from the provider that owns them. */
interface DecorationHost {
  readonly gitPath: string;
  settings(): DecoratorSettings;
  notifyChanged(uris: vscode.Uri[]): void;
  log(message: string): void;
}

/**
 * Marks files the current branch changed since it split off the target branch, like a pull request's
 * file list. Files with local changes are skipped because the built-in Git decorations already mark them.
 * Updates whenever the Git extension reports a repository state change; there is no polling.
 */
export class GitFileDecorator implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this.changeEmitter.event;

  /** Keyed by `rootUri.toString()`, because the Git API hands out new `Repository` wrappers on every access. */
  private readonly repositories = new Map<string, RepositoryDecorations>();
  private settings = readSettings();
  private readonly host: DecorationHost;
  private readonly disposables: vscode.Disposable[];

  constructor(git: API, log: (message: string) => void) {
    this.host = {
      gitPath: git.git.path,
      settings: () => this.settings,
      notifyChanged: (uris) => this.notifyChanged(uris),
      log,
    };
    this.disposables = [
      this.changeEmitter,
      vscode.window.registerFileDecorationProvider(this),
      git.onDidOpenRepository((repository) => this.track(repository)),
      git.onDidCloseRepository((repository) => this.untrack(repository)),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(SETTINGS_SECTION)) {
          this.settings = readSettings();
          void this.refreshAll();
        }
      }),
    ];
    git.repositories.forEach((repository) => this.track(repository));
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const key = decorationKey(uri);
    for (const { comparison } of this.repositories.values()) {
      if (comparison?.decoratedFiles.has(key)) {
        return {
          color: this.settings.enableColor
            ? new vscode.ThemeColor("vstoys.gitFileDecorator.changedForeground")
            : undefined,
          badge: this.settings.enableBadge ? "C" : undefined,
          tooltip: `Changed since branching from ${comparison.targetBranch}`,
        };
      }
    }
    return undefined;
  }

  /** Files the branch changed since its target branch, without files that have local changes. */
  branchChangedFiles(): vscode.Uri[] {
    return [...this.repositories.values()].flatMap(({ comparison }) => [...(comparison?.decoratedFiles.values() ?? [])]);
  }

  /** Re-renders every decoration now (badge or color settings may have changed), then re-diffs every repository. */
  async refreshAll(): Promise<void> {
    this.changeEmitter.fire(undefined);
    await Promise.all([...this.repositories.values()].map((repository) => repository.refresh()));
  }

  /** Unregistering the provider makes VS Code drop all of its decorations. */
  dispose(): void {
    this.repositories.forEach((repository) => repository.dispose());
    this.repositories.clear();
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  private track(repository: Repository): void {
    const id = repository.rootUri.toString();
    if (!this.repositories.has(id)) {
      this.repositories.set(id, new RepositoryDecorations(repository, this.host));
    }
  }

  private untrack(repository: Repository): void {
    const id = repository.rootUri.toString();
    const decorations = this.repositories.get(id);
    if (decorations) {
      decorations.dispose();
      this.repositories.delete(id);
      this.notifyChanged([...(decorations.comparison?.decoratedFiles.values() ?? [])]);
    }
  }

  private notifyChanged(uris: vscode.Uri[]): void {
    if (uris.length > MAX_URIS_PER_EVENT) {
      this.changeEmitter.fire(undefined);
    } else if (uris.length > 0) {
      this.changeEmitter.fire(uris);
    }
  }
}

/** Keeps one repository's decorations current with its Git state. */
class RepositoryDecorations implements vscode.Disposable {
  /** Undefined before the first successful diff and after a failed one. */
  comparison: BranchComparison | undefined;

  private readonly stateSubscription: vscode.Disposable;
  private running: Promise<void> = Promise.resolve();
  private queued: Promise<void> | undefined;
  private lastReportedError: string | undefined;
  private disposed = false;

  constructor(
    private readonly repository: Repository,
    private readonly host: DecorationHost
  ) {
    this.stateSubscription = repository.state.onDidChange(() => void this.refresh());
    void this.refresh();
  }

  /**
   * Recomputes the comparison. Calls made while one is running share a single follow-up run,
   * so a burst of Git events costs at most two diffs.
   */
  refresh(): Promise<void> {
    if (!this.queued) {
      const run = () => {
        this.queued = undefined;
        return this.compare();
      };
      // Run even after a rejected run, whose callers already received that rejection.
      this.queued = this.running.then(run, run);
      this.running = this.queued;
    }
    return this.queued;
  }

  dispose(): void {
    this.disposed = true;
    this.stateSubscription.dispose();
  }

  /** A failed diff is logged once and clears the decorations. */
  private async compare(): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (!this.repository.state.HEAD?.commit) {
      this.setComparison(undefined); // No commits yet, so there is no branch to compare.
      return;
    }

    const cwd = this.repository.rootUri.fsPath;
    try {
      const targetBranch = await this.resolveTargetBranch(cwd);
      const changedPaths = await runGit(
        this.host.gitPath,
        ["diff", "--name-only", "-z", `${targetBranch}...HEAD`, "--"],
        cwd
      );
      if (!this.disposed) {
        this.setComparison({ targetBranch, decoratedFiles: this.withoutLocalChanges(changedPaths) });
        this.lastReportedError = undefined;
      }
    } catch (error) {
      if (!this.disposed) {
        const reason = error instanceof Error ? error.message : String(error);
        this.reportOnce(`Cannot compare ${cwd} with its target branch (see ${SETTINGS_SECTION}): ${reason}`);
        this.setComparison(undefined);
      }
    }
  }

  /** The remote's default branch (e.g. `origin/main`) when auto-detect finds one, otherwise the configured branch. */
  private async resolveTargetBranch(cwd: string): Promise<string> {
    const { autoDetectDefaultBranch, targetBranch } = this.host.settings();
    let resolved = targetBranch;
    if (autoDetectDefaultBranch) {
      try {
        // Unlike `symbolic-ref`, this fails when origin/HEAD points at a deleted branch (e.g. after master -> main).
        const args = ["rev-parse", "--abbrev-ref", "--verify", "--quiet", "refs/remotes/origin/HEAD"];
        resolved = (await runGit(this.host.gitPath, args, cwd)).trim() || targetBranch;
      } catch {
        // Expected when there is no `origin` remote or no usable origin/HEAD; use the configured branch.
      }
    }
    // Both sources come from the repository (.vscode/settings.json, .git refs), and git parses a leading "-" as an option.
    if (!resolved || resolved.startsWith("-")) {
      throw new Error(`'${resolved}' is not a valid target branch`);
    }
    return resolved;
  }

  /** Maps `git diff --name-only -z` output to URIs, skipping files with staged, unstaged, untracked or conflicted changes. */
  private withoutLocalChanges(nulSeparatedPaths: string): Map<string, vscode.Uri> {
    const { mergeChanges, indexChanges, workingTreeChanges, untrackedChanges } = this.repository.state;
    const locallyChanged = new Set(
      [...mergeChanges, ...indexChanges, ...workingTreeChanges, ...untrackedChanges].map((change) =>
        decorationKey(change.uri)
      )
    );

    const decoratedFiles = new Map<string, vscode.Uri>();
    for (const relativePath of nulSeparatedPaths.split("\0")) {
      if (relativePath) {
        const uri = vscode.Uri.joinPath(this.repository.rootUri, relativePath);
        const key = decorationKey(uri);
        if (!locallyChanged.has(key)) {
          decoratedFiles.set(key, uri);
        }
      }
    }
    return decoratedFiles;
  }

  /** Swaps in the new comparison and notifies VS Code about every file whose decoration changed. */
  private setComparison(next: BranchComparison | undefined): void {
    const previousFiles = this.comparison?.decoratedFiles ?? new Map<string, vscode.Uri>();
    const nextFiles = next?.decoratedFiles ?? new Map<string, vscode.Uri>();
    // The tooltip names the target branch, so a new target changes every decorated file, not only added/removed ones.
    const targetChanged = next?.targetBranch !== this.comparison?.targetBranch;
    this.comparison = next;

    const changed: vscode.Uri[] = [];
    for (const [key, uri] of previousFiles) {
      if (targetChanged || !nextFiles.has(key)) {
        changed.push(uri);
      }
    }
    for (const [key, uri] of nextFiles) {
      if (!previousFiles.has(key)) {
        changed.push(uri);
      }
    }
    this.host.notifyChanged(changed);
  }

  private reportOnce(message: string): void {
    if (message !== this.lastReportedError) {
      this.lastReportedError = message;
      this.host.log(message);
    }
  }
}
