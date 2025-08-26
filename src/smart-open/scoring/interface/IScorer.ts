import * as vscode from "vscode";
import { UriExt } from "../../picks/IUriExt";
import { ScoringContext } from "./IContextScorer";

/**
 * Base interface for all scoring algorithms
 */
export interface IScorer {
  /**
   * Calculate a score for a file based on the search input
   * @param input The search query string
   * @param file The file information
   * @param context Optional context for enhanced scoring
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
   * Default: false for backward compatibility
   */
  readonly requiresContext?: boolean;
}
