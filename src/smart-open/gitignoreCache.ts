import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { globifyGitIgnoreFile } from "globify-gitignore";

interface GitignoreCache {
  filePath: string;
  lastModified: number;
  globs: Array<{ glob: string; included: boolean }>;
}

interface WorkspaceGitignoreCache {
  [workspaceFolderPath: string]: GitignoreCache | null;
}

// Cache storage
let gitignoreCache: WorkspaceGitignoreCache = {};

// File system watchers for .gitignore files
let gitignoreWatchers: vscode.FileSystemWatcher[] = [];

/**
 * Gets cached gitignore globs or computes them if cache is invalid
 */
export async function getCachedGitignoreGlobs(folderPath: string): Promise<Array<{ glob: string; included: boolean }>> {
  const gitignorePath = path.join(folderPath, ".gitignore");

  // Check if .gitignore exists
  if (!fs.existsSync(gitignorePath)) {
    // No .gitignore file, cache empty result
    gitignoreCache[folderPath] = null;
    return [];
  }

  const fileStats = fs.statSync(gitignorePath);
  const lastModified = fileStats.mtime.getTime();

  // Check if we have valid cached data
  const cached = gitignoreCache[folderPath];
  if (cached && cached.lastModified === lastModified && cached.filePath === gitignorePath) {
    console.log("Using cached gitignore globs for:", folderPath);
    return cached.globs;
  }

  // Cache is invalid or doesn't exist, compute new globs
  console.log("Computing new gitignore globs for:", folderPath);
  const globifyStart = performance.now();

  try {
    const globs = await globifyGitIgnoreFile(folderPath);
    const globifyEnd = performance.now();
    console.log(`   Globify gitignore: ${(globifyEnd - globifyStart).toFixed(2)}ms`);

    // Update cache
    gitignoreCache[folderPath] = {
      filePath: gitignorePath,
      lastModified,
      globs,
    };

    return globs;
  } catch (error) {
    console.error("Error processing gitignore file:", error);
    // Cache the error state as empty globs
    gitignoreCache[folderPath] = {
      filePath: gitignorePath,
      lastModified,
      globs: [],
    };
    return [];
  }
}

/**
 * Invalidates cache for a specific workspace folder
 */
function invalidateCache(folderPath: string): void {
  console.log("Invalidating gitignore cache for:", folderPath);
  delete gitignoreCache[folderPath];
}

/**
 * Creates file system watcher for .gitignore files in workspace folders
 */
function createGitignoreWatcher(workspaceFolder: vscode.WorkspaceFolder): vscode.FileSystemWatcher {
  const gitignorePattern = new vscode.RelativePattern(workspaceFolder, ".gitignore");
  const watcher = vscode.workspace.createFileSystemWatcher(gitignorePattern);

  const folderPath = workspaceFolder.uri.fsPath;

  // Handle .gitignore file changes
  watcher.onDidChange(() => {
    console.log("Gitignore file changed:", folderPath);
    invalidateCache(folderPath);
  });

  watcher.onDidCreate(() => {
    console.log("Gitignore file created:", folderPath);
    invalidateCache(folderPath);
  });

  watcher.onDidDelete(() => {
    console.log("Gitignore file deleted:", folderPath);
    invalidateCache(folderPath);
  });

  return watcher;
}

/**
 * Initializes gitignore watchers for all current workspace folders
 */
export function initializeGitignoreWatchers(): void {
  // Clean up existing watchers
  disposeGitignoreWatchers();

  // Create watchers for current workspace folders
  if (vscode.workspace.workspaceFolders) {
    gitignoreWatchers = vscode.workspace.workspaceFolders.map(createGitignoreWatcher);
    console.log(`Initialized ${gitignoreWatchers.length} gitignore watchers`);
  }
}

/**
 * Handles workspace folder changes
 */
export function handleWorkspaceFoldersChanged(event: vscode.WorkspaceFoldersChangeEvent): void {
  // Remove cache entries for removed folders
  event.removed.forEach((folder) => {
    const folderPath = folder.uri.fsPath;
    delete gitignoreCache[folderPath];
    console.log("Removed gitignore cache for removed workspace:", folderPath);
  });

  // Reinitialize watchers for all current folders
  initializeGitignoreWatchers();
}

/**
 * Disposes all gitignore file system watchers
 */
export function disposeGitignoreWatchers(): void {
  gitignoreWatchers.forEach((watcher) => watcher.dispose());
  gitignoreWatchers = [];
  console.log("Disposed gitignore watchers");
}

/**
 * Clears all cached gitignore data
 */
export function clearGitignoreCache(): void {
  gitignoreCache = {};
  console.log("Cleared gitignore cache");
}
