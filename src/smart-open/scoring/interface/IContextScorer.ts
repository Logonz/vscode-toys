import * as vscode from "vscode";
import { UriExt } from "../../picks/interface/IUriExt";

/**
 * Scoring context that provides additional information for scoring algorithms
 */
export interface ScoringContext {
  /**
   * The currently active text editor, if any
   */
  activeEditor?: vscode.TextEditor;

  /**
   * The currently active workspace folder, if any
   */
  activeWorkspaceFolder?: vscode.WorkspaceFolder;

  /**
   * All files being scored (useful for relative scoring)
   */
  allFiles?: UriExt[];

  /**
   * Additional metadata that scorers might need
   */
  metadata?: Record<string, any>;
}

/**
 * Enhanced scorer interface that supports context-aware scoring
 */
export interface IContextScorer {
  /**
   * Calculate a score for a file based on the search input and context
   * @param input The search query string
   * @param file The file information
   * @param context Additional context for scoring
   * @returns A numerical score (higher is better)
   */
  calculateScore(input: string, file: UriExt, context?: ScoringContext): number;

  /**
   * A unique identifier for this scorer type
   */
  readonly type: string;

  /**
   * Human readable name for this scorer
   */
  readonly name: string;

  /**
   * Whether this scorer should be enabled by default
   */
  readonly enabled: boolean;

  /**
   * Default weight for this scorer when combining scores
   */
  readonly defaultWeight: number;

  /**
   * Whether this scorer requires context to function properly
   */
  readonly requiresContext: boolean;
}
