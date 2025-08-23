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
 * Loads gitignore, creates glob patterns, and returns merged exclude pattern
 * @param folderPath Path to the workspace folder
 * @returns Promise<string> Merged glob pattern for exclusions
 */
export async function createExcludeGlobPattern(folderPath: string): Promise<string> {
  // const totalStart = performance.now();
  // console.log(`=== Creating exclude glob pattern for: ${folderPath} ===`);

  // const ig = loadGitignore(folderPath);

  // const rules: GitignoreRule[] = (ig as any)._rules;
  // console.log("Gitignore rules:", rules);

  const globs = await globifyGitIgnoreFile(folderPath);

  // console.log("Glob patterns from gitignore:", globs);
  const excludeGlobsOnly = globs.filter((glob) => glob.included === false).map((glob) => glob.glob);

  // Add standard exclusions
  excludeGlobsOnly.push("**/.git/**");
  excludeGlobsOnly.push(...searchExcludeCache);
  excludeGlobsOnly.push(...filesExcludeCache);

  // console.log("Original excludeGlobsOnly:", excludeGlobsOnly);

  // const mergeStart = performance.now();
  const mergedExcludePattern = createMergedGlobPattern(excludeGlobsOnly);
  // const mergeEnd = performance.now();
  // console.log(`  Pattern merging: ${(mergeEnd - mergeStart).toFixed(2)}ms`);
  // console.log("Merged exclude pattern:", mergedExcludePattern);

  // const totalEnd = performance.now();
  // console.log(`=== createExcludeGlobPattern total: ${(totalEnd - totalStart).toFixed(2)}ms ===`);

  return mergedExcludePattern;
}
/**
 * Updates the search.exclude cache from VS Code configuration
 */
export function updateSearchExcludeCache(): void {
  const config = vscode.workspace.getConfiguration();
  const searchExclude = config.get<Record<string, boolean>>("search.exclude") || {};

  searchExcludeCache = [];
  for (const [key, value] of Object.entries(searchExclude)) {
    if (value) {
      searchExcludeCache.push(key);
    }
  }
  console.log("Updated search.exclude cache:", searchExcludeCache);
}

/**
 * Updates the files.exclude cache from VS Code configuration
 */
export function updateFilesExcludeCache(): void {
  const config = vscode.workspace.getConfiguration();
  const filesExclude = config.get<Record<string, boolean>>("files.exclude") || {};

  filesExcludeCache = [];
  for (const [key, value] of Object.entries(filesExclude)) {
    if (value) {
      filesExcludeCache.push(key);
    }
  }
  console.log("Updated files.exclude cache:", filesExcludeCache);
}

export async function GetAllFilesInWorkspace(): Promise<vscode.Uri[]> {
  const totalStart = performance.now();
  console.log("=== Performance Profile: GetAllFilesInWorkspace ===");

  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showInformationMessage("No workspace is open.");
    return [];
  }

  const allFiles: vscode.Uri[] = [];

  for (const workspaceFolder of vscode.workspace.workspaceFolders) {
    const folderStart = performance.now();
    const folderPath = workspaceFolder.uri.fsPath;
    const pattern = new vscode.RelativePattern(folderPath, "**/*");

    // console.log("VS Code search.exclude settings:", searchExcludeCache);
    // console.log("VS Code files.exclude settings:", filesExcludeCache);

    const createExcludeStart = performance.now();
    const mergedExcludePattern = await createExcludeGlobPattern(folderPath);
    const createExcludeEnd = performance.now();
    console.log(`  createExcludeGlobPattern: ${(createExcludeEnd - createExcludeStart).toFixed(2)}ms`);

    const findStart = performance.now();
    const files = await vscode.workspace.findFiles(pattern, mergedExcludePattern, 2000);
    const findEnd = performance.now();
    console.log(`  File finding: ${(findEnd - findStart).toFixed(2)}ms (found ${files.length} files)`);

    allFiles.push(...files);

    const folderEnd = performance.now();
    console.log(`Workspace folder "${workspaceFolder.name}" total: ${(folderEnd - folderStart).toFixed(2)}ms`);
  }

  const totalEnd = performance.now();
  console.log(`=== GetAllFilesInWorkspace total: ${(totalEnd - totalStart).toFixed(2)}ms (${allFiles.length} files) ===`);

  return allFiles;
}
