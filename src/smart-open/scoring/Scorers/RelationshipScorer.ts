import * as vscode from "vscode";
import { IContextScorer, ScoringContext } from "../interface/IContextScorer";
import { UriExt } from "../../picks/interface/IUriExt";

// Configuration constants
const DECAY_EVERY_N_ACCESSES = 100; // Apply decay every N file accesses

/**
 * Interface for relationship data between files
 */
interface FileRelationship {
  count: number; // How many times these files were accessed together
  lastAccessCount: number; // Global access count when this relationship was last updated
}

/**
 * RelationshipScorer - tracks file co-access patterns to identify "friend" files
 * Files that are frequently accessed together get higher scores when one is currently active
 */
export class RelationshipScorer implements IContextScorer {
  readonly type = "relationship";
  readonly name = "File Relationships";
  readonly enabled = true;
  readonly defaultWeight = 0.3;
  readonly requiresContext = true; // Needs active editor context

  // Map from file path to its relationships with other files
  private relationships: Map<string, Map<string, FileRelationship>> = new Map();
  private lastActiveDocument: vscode.TextDocument | undefined;
  private debounceTimeout: NodeJS.Timeout | undefined;
  private saveTimeout: NodeJS.Timeout | undefined;
  private context: vscode.ExtensionContext | undefined;
  private globalFileAccessCount: number = 0; // Total file accesses across all files
  private lastDecayAtAccessCount: number = 0; // When we last applied decay

  constructor(context?: vscode.ExtensionContext) {
    this.context = context;

    // Load persisted relationship data
    this.loadPersistedData();

    // Save data on important events
    vscode.window.onDidChangeWindowState((state) => {
      if (!state.focused) {
        this.savePersistedData();
      }
    });

    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.savePersistedData();
    });

    // Track file switches to build relationships
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document) {
        this.debouncedRecordFileSwitch(editor.document);
      }
    });
  }

  calculateScore(input: string, file: UriExt, context?: ScoringContext): number {
    if (!context?.activeEditor) {
      return 0; // Need active editor to calculate relationships
    }

    const activeFilePath = context.activeEditor.document.uri.fsPath;
    const targetFilePath = file.fsPath;

    // Don't score the currently active file
    if (activeFilePath === targetFilePath) {
      return 0;
    }

    // Get relationship strength between active file and target file
    const relationship = this.getRelationshipStrength(activeFilePath, targetFilePath);

    if (relationship.count === 0) {
      return 0;
    }

    // Convert relationship count to a score with activity-based decay
    const baseScore = Math.log(relationship.count + 1) * 10; // Logarithmic scaling

    // Apply activity-based decay - relationships get weaker based on development activity
    const accessesSinceLastUpdate = this.globalFileAccessCount - relationship.lastAccessCount;
    const activityDecay = Math.exp(-accessesSinceLastUpdate / (DECAY_EVERY_N_ACCESSES * 2)); // Decay over 2x decay intervals

    return baseScore * activityDecay;
  }

  /**
   * Get relationship strength between two files
   */
  private getRelationshipStrength(file1: string, file2: string): FileRelationship {
    // Check both directions of the relationship
    const forward = this.relationships.get(file1)?.get(file2);
    const backward = this.relationships.get(file2)?.get(file1);

    if (!forward && !backward) {
      return { count: 0, lastAccessCount: 0 };
    }

    // Return the stronger relationship
    if (forward && backward) {
      return forward.count >= backward.count ? forward : backward;
    }

    return forward || backward || { count: 0, lastAccessCount: 0 };
  }

  /**
   * Record a file switch with debouncing to avoid rapid duplicate recordings
   */
  private debouncedRecordFileSwitch(document: vscode.TextDocument): void {
    // Clear any existing timeout
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    // Don't record if it's the same file as before
    if (this.lastActiveDocument?.uri.fsPath === document.uri.fsPath) {
      return;
    }

    this.debounceTimeout = setTimeout(() => {
      this.recordFileSwitch(document);
    }, 200); // 200ms debounce
  }

  /**
   * Record a file switch and update relationships
   */
  private recordFileSwitch(currentDocument: vscode.TextDocument): void {
    // Increment global access counter for activity-based decay
    this.globalFileAccessCount++;

    if (this.lastActiveDocument && this.lastActiveDocument.uri.fsPath !== currentDocument.uri.fsPath) {
      // Record the relationship between the previous file and current file
      this.recordRelationship(this.lastActiveDocument, currentDocument);
    }

    this.lastActiveDocument = currentDocument;

    // Check if we should apply decay based on activity
    this.checkAndApplyActivityBasedDecay();

    this.debouncedSave();
  }

  /**
   * Check if enough activity has occurred to trigger decay
   */
  private checkAndApplyActivityBasedDecay(): void {
    const accessesSinceLastDecay = this.globalFileAccessCount - this.lastDecayAtAccessCount;

    if (accessesSinceLastDecay >= DECAY_EVERY_N_ACCESSES) {
      this.decayRelationships();
    }
  }

  /**
   * Apply activity-based decay to relationship counts
   */
  private decayRelationships(decayFactor: number = 0.9): void {
    const accessesSinceLastDecay = this.globalFileAccessCount - this.lastDecayAtAccessCount;

    // Only decay if we have enough activity
    if (accessesSinceLastDecay < DECAY_EVERY_N_ACCESSES) {
      return;
    }

    // Calculate activity-based decay factor
    const decayIntervals = Math.floor(accessesSinceLastDecay / DECAY_EVERY_N_ACCESSES);
    const activityBasedDecayFactor = Math.pow(decayFactor, decayIntervals);

    let removedRelationships = 0;
    let removedFiles = 0;

    for (const [file, relations] of this.relationships.entries()) {
      const toRemove: string[] = [];

      for (const [relatedFile, relationship] of relations.entries()) {
        const newCount = Math.floor(relationship.count * activityBasedDecayFactor);
        if (newCount <= 0) {
          toRemove.push(relatedFile);
        } else {
          relations.set(relatedFile, {
            count: newCount,
            lastAccessCount: relationship.lastAccessCount,
          });
        }
      }

      // Remove weak relationships
      for (const relatedFile of toRemove) {
        relations.delete(relatedFile);
        removedRelationships++;
      }

      // Remove files with no relationships
      if (relations.size === 0) {
        this.relationships.delete(file);
        removedFiles++;
      }
    }

    // Update the last decay access count
    this.lastDecayAtAccessCount += decayIntervals * DECAY_EVERY_N_ACCESSES;

    if (removedRelationships > 0 || removedFiles > 0 || decayIntervals >= 1) {
      console.log(
        `RelationshipScorer: Applied ${decayIntervals} decay intervals (${accessesSinceLastDecay} accesses), removed ${removedRelationships} relationships and ${removedFiles} files`
      );
      this.savePersistedData(); // Save after decay
    }
  }

  /**
   * Record or update a relationship between two files
   */
  private recordRelationship(document1: vscode.TextDocument, document2: vscode.TextDocument): void {
    // Extract file paths for storage (relationships are still keyed by fsPath)
    const file1Path = document1.uri.fsPath;
    const file2Path = document2.uri.fsPath;

    // TODO: In the future, we could use more advanced document data here:
    // - document1.languageId / document2.languageId for language-specific relationships
    // - document1.lineCount for file size considerations
    // - workspace.getWorkspaceFolder(document.uri) for cross-workspace relationships
    // - document.fileName patterns for test/implementation file relationships

    // Ensure both files have relationship maps
    if (!this.relationships.has(file1Path)) {
      this.relationships.set(file1Path, new Map());
    }
    if (!this.relationships.has(file2Path)) {
      this.relationships.set(file2Path, new Map());
    }

    // Update relationship from file1 to file2
    const file1Relationships = this.relationships.get(file1Path)!;
    const existingRelation = file1Relationships.get(file2Path) || { count: 0, lastAccessCount: 0 };
    file1Relationships.set(file2Path, {
      count: existingRelation.count + 1,
      lastAccessCount: this.globalFileAccessCount,
    });

    // Update relationship from file2 to file1 (bidirectional)
    const file2Relationships = this.relationships.get(file2Path)!;
    const existingRelation2 = file2Relationships.get(file1Path) || { count: 0, lastAccessCount: 0 };
    file2Relationships.set(file1Path, {
      count: existingRelation2.count + 1,
      lastAccessCount: this.globalFileAccessCount,
    });

    console.log(
      `RelationshipScorer: Switched from ${vscode.workspace.asRelativePath(
        document1.uri
      )} <-> ${vscode.workspace.asRelativePath(document2.uri)}`
    );
  }

  /**
   * Load persisted relationship data from VS Code's workspace state
   */
  private loadPersistedData(): void {
    if (!this.context) return;

    try {
      const persistedData =
        this.context.workspaceState.get<Record<string, Record<string, FileRelationship>>>("vstoys.relationship.files");
      const globalAccessCount = this.context.workspaceState.get<number>("vstoys.relationship.globalAccessCount", 0);
      const lastDecayAtAccess = this.context.workspaceState.get<number>("vstoys.relationship.lastDecayAtAccess", 0);

      if (persistedData) {
        // Convert nested objects back to nested Maps
        this.relationships = new Map();
        for (const [file, relations] of Object.entries(persistedData)) {
          this.relationships.set(file, new Map(Object.entries(relations)));
        }
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
      console.warn("Failed to load relationship data:", error);
    }
  }

  /**
   * Save relationship data to VS Code's workspace state (debounced)
   */
  private debouncedSave(): void {
    if (!this.context) return;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.savePersistedData();
    }, 2000); // Save after 2 seconds of inactivity
  }

  /**
   * Save relationship data to VS Code's workspace state
   */
  private savePersistedData(): void {
    if (!this.context) return;

    try {
      // Convert nested Maps to nested plain objects for storage
      console.log("Saving relationship data...");
      const dataToSave: Record<string, Record<string, FileRelationship>> = {};
      for (const [file, relations] of this.relationships.entries()) {
        dataToSave[file] = Object.fromEntries(relations);
      }
      this.context.workspaceState.update("vstoys.relationship.files", dataToSave);
      this.context.workspaceState.update("vstoys.relationship.globalAccessCount", this.globalFileAccessCount);
      this.context.workspaceState.update("vstoys.relationship.lastDecayAtAccess", this.lastDecayAtAccessCount);
    } catch (error) {
      console.warn("Failed to save relationship data:", error);
    }
  }

  /**
   * Clean up weak relationships to prevent memory leaks
   * This will apply activity-based decay and can be called safely at any frequency
   */
  cleanup(decayFactor: number = 0.95): void {
    // Apply activity-based decay (will only decay if enough activity has occurred)
    this.decayRelationships(decayFactor);
  }

  /**
   * Get relationship statistics for debugging
   */
  public getStats(): { totalFiles: number; totalRelationships: number; strongRelationships: number } {
    let totalRelationships = 0;
    let strongRelationships = 0;

    for (const relations of this.relationships.values()) {
      totalRelationships += relations.size;
      for (const relationship of relations.values()) {
        if (relationship.count >= 5) {
          strongRelationships++;
        }
      }
    }

    return {
      totalFiles: this.relationships.size,
      totalRelationships,
      strongRelationships,
    };
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

  /**
   * Get the top relationships for a specific file (useful for debugging)
   */
  public getTopRelationships(
    filePath: string,
    limit: number = 10
  ): Array<{ file: string; count: number; lastAccessCount: number }> {
    const relations = this.relationships.get(filePath);
    if (!relations) {
      return [];
    }

    return Array.from(relations.entries())
      .map(([file, relationship]) => ({
        file,
        count: relationship.count,
        lastAccessCount: relationship.lastAccessCount,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}
