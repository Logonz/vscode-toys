import * as vscode from "vscode";

/**
 * object that holds multiple scoring types
 */
export interface FileScore {
  // Individual score components
  fuzzyScore: number;
  recencyScore?: number;
  frequencyScore?: number;
  closenessScore?: number;
  gitScore?: number;
  relationshipScore?: number;
  // ! NEW-SCORER-INSERT-HERE

  // Final computed score (weighted combination)
  finalScore: number;

  // Metadata
  scoredAt: number; // timestamp when score was calculated
  input: string; // the search input used for scoring
}

/**
 * Configuration for score weights and settings
 */
export interface ScoreConfig {
  weights: {
    fuzzy: number;
    recency: number;
    frequency: number;
    closeness: number; // Add closeness weight
    git: number; // Add git weight
    relationship: number; // Add relationship weight
    // ! NEW-SCORER-INSERT-HERE
  };
  enabled: {
    fuzzy: boolean;
    recency: boolean;
    frequency: boolean;
    closeness: boolean; // Add closeness enabled flag
    git: boolean; // Add git enabled flag
    relationship: boolean; // Add relationship enabled flag
    // ! NEW-SCORER-INSERT-HERE
  };
}

/**
 * Default scoring configuration
 */
export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  // Old weights
  // weights: {
  //   fuzzy: 1.0, // Primary scoring mechanism
  //   recency: 0.3, // Recently opened files
  //   frequency: 0.2, // Frequently accessed files
  //   // length: 0.1, // Prefer shorter paths
  //   // path: 0.1, // Path-based bonuses
  //   closeness: 0.5, // Path closeness to active editor
  //   git: 0.4, // Git co-change scoring
  // },
  // Old Weights 2, before closeness tuning
  // weights: {
  //   fuzzy: 0.4, // Primary scoring mechanism (40% of total)
  //   recency: 0.15, // Recently opened files (15% of total)
  //   frequency: 0.15, // Frequently accessed files (15% of total)
  //   // length: 0.1, // Prefer shorter paths
  //   // path: 0.1, // Path-based bonuses
  //   closeness: 0.2, // Path closeness to active editor (20% of total)
  //   git: 0.1, // Git co-change scoring (10% of total)
  // },
  // weights: {
  //   fuzzy: 0.5, // Primary scoring mechanism (50% of total)
  //   recency: 0.1, // Recently opened files (10% of total)
  //   frequency: 0.15, // Frequently accessed files (15% of total)
  //   // length: 0.1, // Prefer shorter paths
  //   // path: 0.1, // Path-based bonuses
  //   closeness: 0.15, // Path closeness to active editor (15% of total)
  //   git: 0.1, // Git co-change scoring (10% of total)
  // },
  weights: {
    fuzzy: 0.8, // Primary scoring mechanism (80% of total)
    recency: 0.1, // Recently opened files (10% of total)
    frequency: 0.2, // Frequently accessed files (20% of total)
    closeness: 0.2, // Path closeness to active editor (20% of total)
    git: 0.1, // Git co-change scoring (10% of total)
    relationship: 0.3, // File relationship scoring (30% of total)
    // ! NEW-SCORER-INSERT-HERE
  },
  enabled: {
    fuzzy: true,
    recency: true,
    frequency: true,
    closeness: true,
    git: false, // Disabled by default due to potential performance impact
    relationship: true, // Enable relationship scoring by default
    // ! NEW-SCORER-INSERT-HERE
  },
};
