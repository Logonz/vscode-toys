import * as vscode from "vscode";
import { IScorer } from "../interface/IScorer";
import { UriExt } from "../../picks/interface/IUriExt";
import { ScoringContext } from "../interface/IContextScorer";

// Configuration constants
const DECAY_EVERY_N_ACCESSES = 100; // Apply decay every N file accesses

/**
 * Frequency scorer - gives higher scores to frequently accessed files
 */
export class FrequencyScorer implements IScorer {
  readonly type = "frequency";
  readonly name = "File Frequency";
  readonly enabled = true; // Enable frequency tracking with persistence
  readonly defaultWeight = 0.2;
  readonly requiresContext = false;

  private fileFrequency: Map<string, number> = new Map(); // fsPath -> access count
  private globalFileAccessCount: number = 0; // Total file accesses across all files
  private lastDecayAtAccessCount: number = 0; // When we last applied decay
  private context: vscode.ExtensionContext | undefined;
  private saveTimeout: NodeJS.Timeout | undefined;

  constructor(context?: vscode.ExtensionContext) {
    this.context = context;

    // Load persisted data and set up save triggers
    this.loadPersistedData();

    // Track file access via active editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document) {
        this.recordFileAccessed(editor.document.uri.fsPath);
      }
    });

    // Save triggers
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
  }

  calculateScore(input: string, file: UriExt, context?: ScoringContext): number {
    const accessCount = this.fileFrequency.get(file.fsPath) || 0;

    return accessCount;
  }

  /**
   * Record that a file was accessed (increments both file frequency and global counter)
   */
  recordFileAccessed(fsPath: string): void {
    // Increment global access counter for activity-based decay
    this.globalFileAccessCount++;

    // Increment specific file frequency
    const current = this.fileFrequency.get(fsPath) || 0;
    this.fileFrequency.set(fsPath, current + 1);

    console.log(`FrequencyScorer: File ${fsPath} accessed, new count is ${current + 1}`);

    // Check if we should apply decay based on activity
    this.checkAndApplyActivityBasedDecay();

    this.debouncedSave();
  }

  /**
   * Get the access count for a file
   */
  getAccessCount(fsPath: string): number {
    return this.fileFrequency.get(fsPath) || 0;
  }

  /**
   * Check if enough activity has occurred to trigger decay
   */
  private checkAndApplyActivityBasedDecay(): void {
    const accessesSinceLastDecay = this.globalFileAccessCount - this.lastDecayAtAccessCount;

    if (accessesSinceLastDecay >= DECAY_EVERY_N_ACCESSES) {
      this.decayFrequencies();
    }
  }
  /**
   * Apply activity-based decay to frequency counts
   * This ensures decay only happens during active development
   */
  decayFrequencies(decayFactor: number = 0.9): void {
    const accessesSinceLastDecay = this.globalFileAccessCount - this.lastDecayAtAccessCount;

    // Only decay if we have enough activity
    if (accessesSinceLastDecay < DECAY_EVERY_N_ACCESSES) {
      return;
    }

    // Calculate activity-based decay factor
    // This decays frequencies based on development activity, not time
    const decayIntervals = Math.floor(accessesSinceLastDecay / DECAY_EVERY_N_ACCESSES);
    const activityBasedDecayFactor = Math.pow(decayFactor, decayIntervals);

    let removedCount = 0;
    for (const [path, count] of this.fileFrequency.entries()) {
      const newCount = Math.floor(count * activityBasedDecayFactor);
      if (newCount <= 0) {
        this.fileFrequency.delete(path);
        removedCount++;
      } else {
        this.fileFrequency.set(path, newCount);
      }
    }

    // Update the last decay access count
    this.lastDecayAtAccessCount += decayIntervals * DECAY_EVERY_N_ACCESSES;

    if (removedCount > 0 || decayIntervals >= 1) {
      console.log(
        `FrequencyScorer: Applied ${decayIntervals} decay intervals (${accessesSinceLastDecay} accesses), removed ${removedCount} entries`
      );
      this.savePersistedData(); // Save after decay
    }
  }
  /**
   * Load persisted frequency data from VS Code's global state
   */
  private loadPersistedData(): void {
    if (!this.context) return;

    try {
      const persistedData = this.context.workspaceState.get<Record<string, number>>("vstoys.frequency.files", {});
      const globalAccessCount = this.context.workspaceState.get<number>("vstoys.frequency.globalAccessCount", 0);
      const lastDecayAtAccess = this.context.workspaceState.get<number>("vstoys.frequency.lastDecayAtAccess", 0);

      if (persistedData) {
        // Convert object back to Map
        this.fileFrequency = new Map(Object.entries(persistedData));
      }

      if (typeof globalAccessCount === "number") {
        this.globalFileAccessCount = globalAccessCount;
      }

      if (typeof lastDecayAtAccess === "number") {
        this.lastDecayAtAccessCount = lastDecayAtAccess;
      }

      // Check if we should apply any pending decay based on accumulated activity
      this.checkAndApplyActivityBasedDecay();
    } catch (error) {
      console.warn("Failed to load frequency data:", error);
    }
  }

  /**
   * Save frequency data to VS Code's global state (debounced)
   */
  private debouncedSave(): void {
    if (!this.context) return;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.savePersistedData();
    }, 2000); // Save after 2 seconds of inactivity (less frequent than recency)
  }

  /**
   * Save frequency data to VS Code's global state
   */
  private savePersistedData(): void {
    if (!this.context) return;

    try {
      // Convert Map to plain object for storage
      console.log("Saving frequency data...");
      const dataToSave = Object.fromEntries(this.fileFrequency);
      this.context.workspaceState.update("vstoys.frequency.files", dataToSave);
      this.context.workspaceState.update("vstoys.frequency.globalAccessCount", this.globalFileAccessCount);
      this.context.workspaceState.update("vstoys.frequency.lastDecayAtAccess", this.lastDecayAtAccessCount);
    } catch (error) {
      console.warn("Failed to save frequency data:", error);
    }
  }

  /**
   * Cleanup old and low-frequency entries
   * This will apply activity-based decay and can be called safely at any frequency
   */
  cleanup(decayFactor: number = 0.95): void {
    // Apply activity-based decay (will only decay if enough activity has occurred)
    this.decayFrequencies(decayFactor);
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
