import * as vscode from "vscode";
import { IScorer } from "../interface/IScorer";
import { UriExt } from "../../picks/interface/IUriExt";
import { ScoringContext } from "../interface/IContextScorer";

/**
 * Recency scorer - gives higher scores to recently opened files
 */
export class RecencyScorer implements IScorer {
  readonly type = "recency";
  readonly name = "Recent Files";
  readonly enabled = true; // Enable recency tracking
  readonly defaultWeight = 0.3;
  readonly requiresContext = false;

  private recentFiles: Map<string, number> = new Map(); // fsPath -> timestamp
  private lastRecordedFile: string | undefined; // Prevent duplicate recordings
  private debounceTimeout: NodeJS.Timeout | undefined;
  private context: vscode.ExtensionContext | undefined;
  private saveTimeout: NodeJS.Timeout | undefined;

  constructor(context?: vscode.ExtensionContext) {
    this.context = context;

    // Save and Load logic
    this.loadPersistedData();
    vscode.window.onDidChangeWindowState((state) => {
      if (!state.focused) {
        // User switched away from VS Code - good time to save
        this.savePersistedData();
      }
    });
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      // Save before workspace changes
      this.savePersistedData();
    });

    // Recency tracking
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document) {
        this.debouncedRecordFileOpened(editor.document.uri.fsPath);
      }
    });
  }

  calculateScore(input: string, file: UriExt, context?: ScoringContext): number {
    const lastOpened = this.recentFiles.get(file.fsPath);
    if (!lastOpened) {
      return 0;
    }

    // Score based on how recently the file was opened
    // More recent = higher score, with exponential decay
    const minutesSinceOpened = (Date.now() - lastOpened) / (1000 * 60);
    const recencyScore = Math.max(0, 100 * Math.exp(-minutesSinceOpened / 1440)); // Decay over 24 hours

    return recencyScore;
  }

  /**
   * Track when a file was opened with debouncing to avoid rapid duplicate recordings
   */
  private debouncedRecordFileOpened(fsPath: string): void {
    // Clear any existing timeout
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    // Don't record the same file multiple times in quick succession
    if (this.lastRecordedFile === fsPath) {
      return;
    }

    this.debounceTimeout = setTimeout(() => {
      this.recordFileOpened(fsPath);
      this.lastRecordedFile = fsPath;
    }, 100); // 100ms debounce
  }

  /**
   * Track when a file was opened
   */
  recordFileOpened(fsPath: string): void {
    this.recentFiles.set(fsPath, Date.now());
    this.debouncedSave();
  }

  /**
   * Load persisted recency data from VS Code's global state
   */
  private loadPersistedData(): void {
    if (!this.context) return;

    try {
      const persistedData = this.context.workspaceState.get<Record<string, number>>("vstoys.recency.files");
      if (persistedData) {
        // Convert object back to Map and cleanup old entries
        this.recentFiles = new Map(Object.entries(persistedData));
        this.cleanup(); // Clean up old entries on load
      }
    } catch (error) {
      console.warn("Failed to load recency data:", error);
    }
  }

  /**
   * Save recency data to VS Code's global state (debounced)
   */
  private debouncedSave(): void {
    if (!this.context) return;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.savePersistedData();
    }, 1000); // Save after 1 second of inactivity
  }

  /**
   * Save recency data to VS Code's global state
   */
  private savePersistedData(): void {
    if (!this.context) return;

    try {
      // Convert Map to plain object for storage
      const dataToSave = Object.fromEntries(this.recentFiles);
      this.context.workspaceState.update("vstoys.recency.files", dataToSave);
    } catch (error) {
      console.warn("Failed to save recency data:", error);
    }
  }

  /**
   * Clear old entries to prevent memory leaks
   */
  cleanup(olderThanHours: number = 168): void {
    // Default: 1 week
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
    let removedCount = 0;

    for (const [path, timestamp] of this.recentFiles.entries()) {
      if (timestamp < cutoff) {
        this.recentFiles.delete(path);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`RecencyScorer: Cleaned up ${removedCount} old entries`);
      this.savePersistedData(); // Save after cleanup
    }
  }

  /**
   * Force save current data (useful for extension deactivation)
   */
  public forceSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.savePersistedData();
  }
}
