// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import path from "path/win32";
import * as vscode from "vscode";
import ignore from "ignore";
import fs from "fs";
import { globifyGitIgnoreFile, globifyGitIgnore } from "globify-gitignore";

interface GitignoreRule {
  negative: boolean;
  origin: string;
  pattern: string;
  regex: RegExp;
}

// Static cache for exclude settings
let searchExcludeCache: string[] = [];
let filesExcludeCache: string[] = [];

function loadGitignore(folderPath: string): ReturnType<typeof ignore> {
  const ig = ignore();
  const gitignorePath = path.join(folderPath, ".gitignore");

  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
    ig.add(gitignoreContent);
  }

  return ig;
}


/**
 * Creates a merged glob pattern using brace expansion from an array of glob patterns
 * @param patterns Array of glob patterns to merge
 * @returns Single merged glob pattern or the original pattern if only one exists
 */
function createMergedGlobPattern(patterns: string[]): string {
  if (patterns.length === 0) {
    return "";
  }

  if (patterns.length === 1) {
    return patterns[0];
  }

  // Simple approach: just use brace expansion for all patterns
  return `{${patterns.join(",")}}`;
}
/**
 * Updates the search.exclude cache from VS Code configuration
 */
function updateSearchExcludeCache(): void {
  const config = vscode.workspace.getConfiguration();
  const searchExclude = config.get<Record<string, boolean>>("search.exclude") || {};

  searchExcludeCache = [];
  for (const [key, value] of Object.entries(searchExclude)) {
    if (value) {
      searchExcludeCache.push(key);
    }
  }
}

/**
 * Updates the files.exclude cache from VS Code configuration
 */
function updateFilesExcludeCache(): void {
  const config = vscode.workspace.getConfiguration();
  const filesExclude = config.get<Record<string, boolean>>("files.exclude") || {};

  filesExcludeCache = [];
  for (const [key, value] of Object.entries(filesExclude)) {
    if (value) {
      filesExcludeCache.push(key);
    }
  }
}
export async function StartListener() {
  // Initialize caches on startup
  updateSearchExcludeCache();
  updateFilesExcludeCache();

  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("search.exclude")) {
      updateSearchExcludeCache();
      console.log("Updated search.exclude cache:", searchExcludeCache);
    } else if (event.affectsConfiguration("files.exclude")) {
      updateFilesExcludeCache();
      console.log("Updated files.exclude cache:", filesExcludeCache);
    }
  });
}

export async function GetAllFilesInWorkspace(): Promise<vscode.Uri[]> {
  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showInformationMessage("No workspace is open.");
    return [];
  }

  const allFiles: vscode.Uri[] = [];

  for (const workspaceFolder of vscode.workspace.workspaceFolders) {
    const folderPath = workspaceFolder.uri.fsPath;
    const pattern = new vscode.RelativePattern(folderPath, "**/*");

    // Use cached exclude settings
    console.log("VS Code search.exclude settings:", searchExcludeCache);
    console.log("VS Code files.exclude settings:", filesExcludeCache);

    const ig = loadGitignore(folderPath);
    const g = ig.createFilter();
    console.log(g);

    // Extract the rules from gitignore
    const rules: GitignoreRule[] = (ig as any)._rules;
    console.log("Gitignore rules:", rules);

    // ! TODO: In the future if better tooling around this exist this should be improved

    const globs = await globifyGitIgnoreFile(folderPath);
    console.log("Glob patterns from gitignore:", globs);
    const excludeGlobsOnly = globs.filter((glob) => glob.included === false).map((glob) => glob.glob);
    // insert **/.git/** to the exclude globs
    excludeGlobsOnly.push("**/.git/**");

    // Inject VS Code exclude patterns
    excludeGlobsOnly.push(...searchExcludeCache);
    excludeGlobsOnly.push(...filesExcludeCache);

    console.log("Original excludeGlobsOnly:", excludeGlobsOnly);

    // Create merged glob pattern using brace expansion
    const mergedExcludePattern = createMergedGlobPattern(excludeGlobsOnly);
    console.log("Merged exclude pattern:", mergedExcludePattern);

    const files = await vscode.workspace.findFiles(pattern, mergedExcludePattern, 2000);
    console.log(files);
    // files.forEach((file) => {
    //   // if (passesGitignoreCheck(file.fsPath, folderPath, ig)) {
    //   //   allFiles.push(file);
    //   // }
    // });
    allFiles.push(...files);

    // Write a list of filenames to a file in the workspace folder.
    const fileList = files.map((file) => file.fsPath);
    const fileListContent = fileList.join("\n");
    const fileListUri = vscode.Uri.file(path.join(folderPath, "file-list.txt"));

    await vscode.workspace.fs.writeFile(fileListUri, Buffer.from(fileListContent, "utf-8"));
  }

  return allFiles;
}
