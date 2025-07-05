import * as vscode from "vscode";
import * as child_process from "child_process";
import * as path from "path";
import { file } from "tmp";

export class GitFileDecorator implements vscode.FileDecorationProvider {
  private readonly _onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[]> =
    new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
  private gitStatusCache: string[] = [];
  private gitDiffCache: string[] = [];
  private refreshTimeout: NodeJS.Timeout | undefined;

  // Configuration
  private enabled: boolean = true;
  private refreshInterval: number = 5000;
  private targetBranch: string = "main";

  readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> = this._onDidChangeFileDecorations.event;

  constructor() {
    // Listen for file changes to dynamically update decorations
    // vscode.workspace.onDidChangeTextDocument((event) => {
    //   console.log(`[vstoys] File changed: ${event.document.uri.fsPath}`);
    //   this.refreshCache();
    //   this.refresh(event.document.uri);
    // });

    vscode.workspace.onDidSaveTextDocument((document) => {
      console.log(`[vstoys] File saved: ${document.uri.fsPath}`);
      this.refreshCache();
      this.refresh(document.uri);
    });

    vscode.workspace.onDidDeleteFiles((event) => {
      this.refreshCache();
      event.files.forEach((file) => {
        console.log(`[vstoys] File deleted: ${file.fsPath}`);
        this.refresh(file);
      });
    });

    vscode.workspace.onDidCreateFiles((event) => {
      this.refreshCache();
      event.files.forEach((file) => {
        console.log(`[vstoys] File created: ${file.fsPath}`);
        this.refresh(file);
      });
    });

    vscode.workspace.onDidRenameFiles((event) => {
      this.refreshCache();
      event.files.forEach((file) => {
        console.log(`[vstoys] File renamed: ${file.oldUri.fsPath} to ${file.newUri.fsPath}`);
        this.refresh(file.newUri);
      });
    });

    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      console.log(`[vstoys] Workspace folders changed.`);
      this.refreshCache();
      this.refresh();
    });

    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("vstoys.git.fileDecorator")) {
        console.log(`[vstoys] File decorator configuration changed.`);
        this.updateConfig();
        this.refreshCache();
        this.refresh();
      }
    });

    this.updateConfig();
    this.refreshCache();
    this.schedulePeriodicRefresh();
  }

  private updateConfig(): void {
    const config = vscode.workspace.getConfiguration("vstoys.git.fileDecorator");
    this.enabled = config.get("enabled", true);
    this.refreshInterval = config.get("refreshInterval", 5000);
    this.targetBranch = config.get("targetBranch", "main");
  }

  private isEnabled(): boolean {
    return this.enabled;
  }

  private schedulePeriodicRefresh() {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }
    console.log(`[vstoys] Scheduling periodic refresh every ${this.refreshInterval} ms`);
    this.refreshTimeout = setTimeout(() => {
      if (this.isEnabled()) {
        this.refreshCache();
        this.refresh();
      }
      this.schedulePeriodicRefresh();
    }, this.refreshInterval < 1000 ? 1000 : this.refreshInterval); // Ensure minimum interval of 1 second
  }

  private refreshCache(): void {
    if (!this.isEnabled()) {
      console.log("[vstoys] File decorator is disabled. Not refreshing cache.");
      this.gitStatusCache = [];
      this.gitDiffCache = [];
      return;
    }
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        console.log(`[vstoys] No workspace folder found.`);
        return;
      }

      const cwd = workspaceFolder.uri.fsPath;

      // Cache Git status
      this.gitStatusCache = child_process
        .execSync(`git status --porcelain`, { cwd })
        .toString()
        .split("\n")
        .map((line) => line.trim());

      // Cache Git diff
      this.gitDiffCache = child_process
        .execSync(`git diff ${this.targetBranch} --name-only`, { cwd })
        .toString()
        .split("\n")
        .map((line) => line.trim());

      console.log(`[vstoys] Git cache refreshed.`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        console.error(`[vstoys] Git is not installed or not found in PATH.`);
      } else {
        console.error(`[vstoys] Error refreshing Git cache:`, error);
      }
    }
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (!this.isEnabled()) {
      return undefined;
    }
    if (this.gitDiffCache.length === 0 && this.gitStatusCache.length === 0) {
      console.log(`[vstoys] No Git cache available, skipping decoration for ${uri.fsPath}, Are you in a Git repository and have git installed?`);
      return undefined;
    }

    const filePath = uri.fsPath;

    try {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
      if (!workspaceFolder) {
        console.log(`[vstoys] File ${filePath} is not in a workspace folder.`);
        return undefined;
      }

      // Use path.relative for correct platform handling, then normalize to forward slashes
      const relativeFilePath = path.relative(workspaceFolder.uri.fsPath, filePath).replace(/\\/g, "/");
      // console.log(`[vstoys] Checking decoration for file: ${relativeFilePath}`, filePath);

      // Use cached data to determine decoration
      if (
        this.gitDiffCache.includes(relativeFilePath) &&
        !this.gitStatusCache.some((statusLine) => statusLine.endsWith(relativeFilePath))
      ) {
        console.log(`[vstoys] File ${filePath} differs from ${this.targetBranch} and has no unstaged changes, applying decoration.`);
        return {
          color: new vscode.ThemeColor("button.foreground"),
          badge: "C",
          tooltip: `Changed (differs from ${this.targetBranch})`,
        };
      }
    } catch (error) {
      console.error(`[vstoys] Error checking Git status for ${filePath}:`, error);
    }

    // console.log(`[vstoys] No decoration applied for file: ${filePath}`);
    return undefined;
  }

  refresh(uri?: vscode.Uri): void {
    console.log(`[vstoys] Refreshing decorations.`);
    if (uri) {
      this._onDidChangeFileDecorations.fire(uri);
    } else {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        const allFilesPromises = workspaceFolders.map((folder) => {
          return vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*"));
        });

        Promise.all(allFilesPromises).then((results) => {
          const allFiles = results.flat();
          this._onDidChangeFileDecorations.fire(allFiles);
        });
      } else {
        this._onDidChangeFileDecorations.fire([]);
      }
    }
  }
}


export function activateFileDecorator(name: string, context: vscode.ExtensionContext) {
  console.log(`${name} extension activated.`);

  const decorator = new GitFileDecorator();
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorator));
}
