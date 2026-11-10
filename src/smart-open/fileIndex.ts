import * as vscode from "vscode";
import * as path from "path";
import { GetCustomLabelForFile, HasCustomLabelPatterns } from "../helpers/customEditorLabelService";
import { createExcludeTest, enabledPatterns } from "./exclude";
import { fileKey } from "./fileKey";
import { deletedFileKeys, runGit } from "./git";
import { parseTrackedFiles, parseUntrackedFiles } from "./gitOutput";
import { virtualName } from "./query";
import type { RankableFile } from "./ranking";

/** Catches what the watchers miss, e.g. `git rm --cached` or a watcher over its OS limit in a huge repository. */
const REBUILD_AFTER_MS = 10 * 60 * 1000;

/** Settings that change which files are listed, or their labels. */
const INDEX_SETTINGS = [
  "files.exclude",
  "search.exclude",
  "vstoys.smart-open.maxWorkspaceFiles",
  "workbench.editor.customLabels",
];

export interface IndexedFile extends RankableFile {
  readonly folder: vscode.WorkspaceFolder;
  /** Path inside `folder`, `/`-separated. */
  readonly folderRelativePath: string;
  /** What the picker shows: the custom label when one applies, otherwise the file name. */
  readonly label: string;
}

/** Created on demand: making a `Uri` for every file of a giant repository costs more than everything else here. */
export function fileUri(file: IndexedFile): vscode.Uri {
  return vscode.Uri.joinPath(file.folder.uri, file.folderRelativePath);
}

/** Where a file sits in the workspace: computed the same way for indexed files and for the active editor. */
export interface FileLocation {
  readonly key: string;
  readonly relativePath: string;
  readonly directory: string;
  readonly folderIndex: number;
}

/** Undefined for files outside the workspace folders, or not on disk (untitled, output panels, diffs). */
export function locate(uri: vscode.Uri): FileLocation | undefined {
  const folder = uri.scheme === "file" ? vscode.workspace.getWorkspaceFolder(uri) : undefined;
  if (!folder) {
    return undefined;
  }
  return locateInFolder(folder, path.posix.relative(folder.uri.path, uri.path), isMultiRoot());
}

function locateInFolder(folder: vscode.WorkspaceFolder, folderRelativePath: string, multiRoot: boolean): FileLocation {
  // Same shape as `workspace.asRelativePath`, which prefixes the folder name in multi-root workspaces.
  const relativePath = multiRoot ? `${folder.name}/${folderRelativePath}` : folderRelativePath;
  const folderEnd = relativePath.lastIndexOf("/");
  return {
    key: keyInFolder(folder, folderRelativePath),
    relativePath,
    directory: folderEnd === -1 ? "" : relativePath.slice(0, folderEnd),
    folderIndex: folder.index,
  };
}

/** `fileKey()` of a folder-relative path. Concatenation instead of `path.join`, which is slow at 200k files. */
function keyInFolder(folder: vscode.WorkspaceFolder, folderRelativePath: string): string {
  const root = folder.uri.fsPath;
  const nativePath = path.sep === "/" ? folderRelativePath : folderRelativePath.replace(/\//g, path.sep);
  return fileKey(root.endsWith(path.sep) ? root + nativePath : root + path.sep + nativePath);
}

function isMultiRoot(): boolean {
  return (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
}

/**
 * Every file in the workspace, as listed by git (so all of git's ignore rules apply) or by `findFiles` for
 * folders outside git, minus `files.exclude` and `search.exclude`.
 *
 * Rebuilds lazily: watchers only mark the list stale, and the picker calls `refreshIfNeeded()` when it opens,
 * showing the previous list until the new one is ready.
 */
export class FileIndex implements vscode.Disposable {
  private files: readonly IndexedFile[] = [];
  /** Keys of the indexed files, and of every folder (and workspace folder) that contains one. */
  private fileKeys = new Set<string>();
  private folderKeys = new Set<string>();
  private builtAt: number | undefined;
  private stale = true;
  private building: Promise<void> | undefined;
  private readonly updated = new vscode.EventEmitter<void>();
  /** Fires when a rebuild has changed the file list. */
  readonly onDidUpdate = this.updated.event;
  private readonly disposables: vscode.Disposable[];

  constructor(private readonly log: (message: string) => void) {
    const markStale = () => {
      this.stale = true;
    };
    const anyFile = vscode.workspace.createFileSystemWatcher("**/*", false, true, false);
    const ignoreFiles = vscode.workspace.createFileSystemWatcher("**/.gitignore", true, false, true);
    this.disposables = [
      this.updated,
      anyFile,
      ignoreFiles,
      // Only changes next to or of listed files matter: this skips `.git` internals, node_modules, build output
      // and other ignored folders, whose files are never listed.
      anyFile.onDidCreate((uri) => {
        if (this.folderKeys.has(fileKey(path.dirname(uri.fsPath)))) {
          markStale();
        }
      }),
      anyFile.onDidDelete((uri) => {
        const key = fileKey(uri.fsPath);
        if (this.fileKeys.has(key) || this.folderKeys.has(key)) {
          markStale();
        }
      }),
      ignoreFiles.onDidChange(markStale),
      vscode.workspace.onDidChangeWorkspaceFolders(markStale),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (INDEX_SETTINGS.some((setting) => event.affectsConfiguration(setting))) {
          markStale();
        }
      }),
    ];
  }

  get current(): readonly IndexedFile[] {
    return this.files;
  }

  get hasBuilt(): boolean {
    return this.builtAt !== undefined;
  }

  get ageMs(): number | undefined {
    return this.builtAt === undefined ? undefined : Date.now() - this.builtAt;
  }

  markStale(): void {
    this.stale = true;
  }

  /** Rebuilds when files may have changed since the last build. Concurrent calls share one build. */
  refreshIfNeeded(): Promise<void> {
    const fresh = !this.stale && this.builtAt !== undefined && Date.now() - this.builtAt < REBUILD_AFTER_MS;
    if (this.building || fresh) {
      return this.building ?? Promise.resolve();
    }
    this.stale = false; // Changes seen during the build mark it stale again.
    this.building = this.rebuild().finally(() => {
      this.building = undefined;
    });
    return this.building;
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  private async rebuild(): Promise<void> {
    const started = performance.now();
    const files: IndexedFile[] = [];
    const sources: string[] = [];
    let maxFiles = 0;
    try {
      const folders = vscode.workspace.workspaceFolders ?? [];
      maxFiles = vscode.workspace.getConfiguration("vstoys.smart-open").get<number>("maxWorkspaceFiles", 200000);
      const multiRoot = folders.length > 1;
      const withLabels = HasCustomLabelPatterns();
      // Deleted but not yet staged: still in git's index, no longer on disk.
      const deleted = deletedFileKeys();

      for (const folder of folders) {
        if (files.length >= maxFiles) {
          break;
        }
        // Per folder, since each folder's own .vscode/settings.json can add excludes.
        const config = vscode.workspace.getConfiguration(undefined, folder.uri);
        const excludePatterns = enabledPatterns(config.get("files.exclude"), config.get("search.exclude"));
        const isExcluded = createExcludeTest(excludePatterns, (pattern, error) =>
          this.log(`Ignoring the exclude pattern "${pattern}", which is not a valid glob: ${error}`)
        );

        const listing = await listFolder(folder, excludePatterns, maxFiles - files.length);
        sources.push(`${folder.name}: ${listing.source}`);
        for (const folderRelativePath of listing.paths) {
          if (files.length >= maxFiles) {
            break;
          }
          if (!isExcluded(folderRelativePath)) {
            const file = indexedFile(folder, folderRelativePath, multiRoot, withLabels);
            if (!deleted.has(file.key)) {
              files.push(file);
            }
          }
        }
      }
    } catch (error) {
      this.stale = true;
      this.log(`Could not list the workspace files, keeping the previous list: ${error instanceof Error ? error.stack : error}`);
      return;
    }

    const changed = !sameFiles(this.files, files);
    this.files = files;
    this.fileKeys = new Set(files.map((file) => file.key));
    this.folderKeys = folderKeysOf(files);
    this.builtAt = Date.now();
    const limitNote = files.length >= maxFiles ? `; stopped at vstoys.smart-open.maxWorkspaceFiles (${maxFiles})` : "";
    this.log(`Indexed ${files.length} files in ${(performance.now() - started).toFixed(0)}ms (${sources.join(", ")}${limitNote})`);
    if (changed) {
      this.updated.fire(); // Only real changes re-rank an open picker, which would move the items under the mouse.
    }
  }
}

function indexedFile(
  folder: vscode.WorkspaceFolder,
  folderRelativePath: string,
  multiRoot: boolean,
  withLabels: boolean
): IndexedFile {
  const location = locateInFolder(folder, folderRelativePath, multiRoot);
  const fileName = folderRelativePath.slice(folderRelativePath.lastIndexOf("/") + 1);
  const customLabel = withLabels
    ? GetCustomLabelForFile(vscode.Uri.joinPath(folder.uri, folderRelativePath))
    : undefined;
  const matchName = customLabel || virtualName(location.relativePath);
  return {
    ...location,
    folder,
    folderRelativePath,
    relativePathLower: location.relativePath.toLowerCase(),
    label: customLabel || fileName,
    matchName,
    matchNameLower: matchName.toLowerCase(),
  };
}

function sameFiles(previous: readonly IndexedFile[], next: readonly IndexedFile[]): boolean {
  return (
    previous.length === next.length &&
    previous.every((file, i) => file.key === next[i].key && file.label === next[i].label && file.relativePath === next[i].relativePath)
  );
}

/** Keys of each workspace folder and every folder inside it that contains an indexed file, directly or deeper. */
function folderKeysOf(files: readonly IndexedFile[]): Set<string> {
  const keys = new Set<string>();
  const seen = new Set<string>(); // "<folder index>/<folder-relative directory>"
  for (const { folder, folderRelativePath } of files) {
    keys.add(fileKey(folder.uri.fsPath));
    let directoryEnd = folderRelativePath.lastIndexOf("/");
    while (directoryEnd > 0) {
      const directory = folderRelativePath.slice(0, directoryEnd);
      const id = `${folder.index}/${directory}`;
      if (seen.has(id)) {
        break; // Its parents were added along with it.
      }
      seen.add(id);
      keys.add(keyInFolder(folder, directory));
      directoryEnd = directory.lastIndexOf("/");
    }
  }
  return keys;
}

interface FolderListing {
  /** Folder-relative, `/`-separated. */
  readonly paths: readonly string[];
  readonly source: string;
}

async function listFolder(folder: vscode.WorkspaceFolder, excludePatterns: string[], limit: number): Promise<FolderListing> {
  let gitProblem = "";
  if (folder.uri.scheme === "file") {
    try {
      const paths = await listGitFiles(folder.uri.fsPath);
      if (paths.length > 0) {
        return { paths, source: "git" };
      }
      gitProblem = " (git listed nothing)"; // e.g. the folder is ignored by an enclosing repository
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Outside a repository is expected; anything else (git missing, a broken repository) is worth showing.
      gitProblem = message.includes("not a git repository") ? "" : ` (git failed: ${message})`;
    }
  }
  // VS Code's globs cannot nest braces, so patterns with their own braces only apply through the exclude test.
  const flatPatterns = excludePatterns.filter((pattern) => !pattern.includes("{"));
  const exclude = flatPatterns.length > 0 ? `{${flatPatterns.join(",")}}` : undefined;
  const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*"), exclude, limit);
  return {
    paths: uris.map((uri) => path.posix.relative(folder.uri.path, uri.path)),
    source: `findFiles${gitProblem}`,
  };
}

/**
 * Tracked files (including inside submodules) except those a sparse checkout left off disk, plus untracked
 * files git does not ignore, including those of nested repositories. Files deleted but not yet staged are
 * still listed: asking git for them stats every file, which is slow in large or WSL-mounted repositories.
 */
async function listGitFiles(cwd: string): Promise<string[]> {
  const [tracked, untracked] = await Promise.all([
    runGit(["ls-files", "-z", "--stage", "-t", "--recurse-submodules"], cwd),
    runGit(["ls-files", "-z", "--others", "--exclude-standard"], cwd),
  ]);
  const { files, nestedRepositories } = parseUntrackedFiles(untracked);
  const nestedFiles = await Promise.all(
    nestedRepositories.map(async (nested) => (await listGitFiles(path.join(cwd, nested))).map((file) => nested + file))
  );
  return [...parseTrackedFiles(tracked), ...files, ...nestedFiles.flat()];
}
