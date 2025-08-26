import { IScorer } from "./interface/IScorer";
import { UriExt } from "../picks/IUriExt";
import { FileScore, ScoreConfig, DEFAULT_SCORE_CONFIG } from "./interface/IScore";
import { ScoringContext } from "./interface/IContextScorer";
import { FuzzyScorer } from "./Scorers/FuzzyScorer";
import { RecencyScorer } from "./Scorers/RecencyScorer";
import { FrequencyScorer } from "./Scorers/FrequencyScorer";
// import { LengthScorer, PathScorer } from "./PathScorers";
import { ClosenessScorer } from "./Scorers/ClosenessScorer";
import * as vscode from "vscode";
import { FileQuickPickItem } from "../picks/IFileQuickPickItem";

/**
 * Main scoring engine that combines multiple scoring algorithms
 */
export class ScoreCalculator {
  private scorers: Map<string, IScorer> = new Map();
  private config: ScoreConfig;

  constructor(config: ScoreConfig = DEFAULT_SCORE_CONFIG) {
    this.config = { ...config };
    this.initializeScorers();
  }

  private initializeScorers(): void {
    const scorers = [
      new FuzzyScorer(),
      new RecencyScorer(),
      new FrequencyScorer(),
      // new LengthScorer(),
      // new PathScorer(),
      new ClosenessScorer(), // Add the new closeness scorer
      // ! NEW-SCORER-INSERT-HERE
    ];

    for (const scorer of scorers) {
      this.scorers.set(scorer.type, scorer);
    }
  }

  /**
   * Calculate comprehensive score for a file
   */
  calculateScore(input: string, file: UriExt, context?: ScoringContext): FileScore {
    const scores: Partial<FileScore> = {
      input,
      scoredAt: Date.now(),
    };

    let finalScore = 0;
    let totalWeight = 0;

    // Calculate individual scores
    for (const [type, scorer] of this.scorers.entries()) {
      if (!this.isEnabled(type)) {
        continue;
      }

      const score = scorer.calculateScore(input, file, context);
      const weight = this.getWeight(type);

      // Store individual score
      switch (type) {
        case "fuzzy":
          scores.fuzzyScore = score;
          break;
        case "recency":
          scores.recencyScore = score;
          break;
        case "frequency":
          scores.frequencyScore = score;
          break;
        // case "length":
        //   scores.lengthScore = score;
        //   break;
        // case "path":
        //   scores.pathScore = score;
        //   break;
        case "closeness":
          scores.closenessScore = score;
          break;
        // ! NEW-SCORER-INSERT-HERE
      }

      // Contribute to final weighted score
      finalScore += score * weight;
      totalWeight += weight;
    }
    // console.log(`Final scores for ${file.fsPath}:`, scores);

    // Normalize final score
    scores.finalScore = totalWeight > 0 ? finalScore / totalWeight : 0;

    return scores as FileScore;
  }

  /**
   * Calculate scores for multiple files efficiently
   */
  calculateScores(input: string, files: UriExt[], context?: ScoringContext): Map<string, FileScore> {
    const scores = new Map<string, FileScore>();

    // Enhance context with all files for relative scoring
    const enhancedContext: ScoringContext = {
      ...context,
      allFiles: files,
    };

    for (const file of files) {
      const score = this.calculateScore(input, file, enhancedContext);
      scores.set(file.fsPath, score);
    }

    return scores;
  }

  /**
   * Get a specific scorer instance (for advanced usage like recording events)
   */
  getScorer<T extends IScorer>(type: string): T | undefined {
    return this.scorers.get(type) as T;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ScoreConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Normalize all scores in the provided items to 0-1 range based on min/max values
   */
  normalizeScores(items: FileQuickPickItem[]): FileQuickPickItem[] {
    if (!items || items.length === 0) {
      return items;
    }

    // First pass: Track min/max for each score type during iteration
    const scoreRanges = {
      fuzzy: { min: Infinity, max: -Infinity },
      recency: { min: Infinity, max: -Infinity },
      frequency: { min: Infinity, max: -Infinity },
      closeness: { min: Infinity, max: -Infinity },
      // ! NEW-SCORER-INSERT-HERE
    };

    for (const item of items) {
      const score = item.score;
      if (!score) continue;

      if (score.fuzzyScore !== undefined && !isNaN(score.fuzzyScore)) {
        scoreRanges.fuzzy.min = Math.min(scoreRanges.fuzzy.min, score.fuzzyScore);
        scoreRanges.fuzzy.max = Math.max(scoreRanges.fuzzy.max, score.fuzzyScore);
      }
      if (score.recencyScore !== undefined && !isNaN(score.recencyScore)) {
        scoreRanges.recency.min = Math.min(scoreRanges.recency.min, score.recencyScore);
        scoreRanges.recency.max = Math.max(scoreRanges.recency.max, score.recencyScore);
      }
      if (score.frequencyScore !== undefined && !isNaN(score.frequencyScore)) {
        scoreRanges.frequency.min = Math.min(scoreRanges.frequency.min, score.frequencyScore);
        scoreRanges.frequency.max = Math.max(scoreRanges.frequency.max, score.frequencyScore);
      }
      if (score.closenessScore !== undefined && !isNaN(score.closenessScore)) {
        scoreRanges.closeness.min = Math.min(scoreRanges.closeness.min, score.closenessScore);
        scoreRanges.closeness.max = Math.max(scoreRanges.closeness.max, score.closenessScore);
      }
      // ! NEW-SCORER-INSERT-HERE
    }

    // Create normalization functions for each score type
    const createNormalizer = (type: string, range: { min: number; max: number }) => {
      // If min is still Infinity, no values were processed
      if (range.min === Infinity) return (val: number) => val;
      const weight = this.getWeight(type);
      const rangeSize = range.max - range.min;
      // If all values are the same, return 0 for all
      if (rangeSize === 0) return (val: number) => 0;
      // Normalize to 0-1 range
      return (val: number) => ((val - range.min) / rangeSize) * weight;
    };

    const normalizeFuzzy = createNormalizer("fuzzy", scoreRanges.fuzzy);
    const normalizeRecency = createNormalizer("recency", scoreRanges.recency);
    const normalizeFrequency = createNormalizer("frequency", scoreRanges.frequency);
    const normalizeCloseness = createNormalizer("closeness", scoreRanges.closeness);
    // ! NEW-SCORER-INSERT-HERE

    // Second pass: Apply normalization to all items
    for (const item of items) {
      const score = item.score;
      if (!score) continue;

      // Initialize final score
      score.finalScore = 0;

      // Normalize each score type
      if (score.fuzzyScore !== undefined && !isNaN(score.fuzzyScore)) {
        score.fuzzyScore = normalizeFuzzy(score.fuzzyScore);
        score.finalScore += score.fuzzyScore;
      }
      if (score.recencyScore !== undefined && !isNaN(score.recencyScore)) {
        score.recencyScore = normalizeRecency(score.recencyScore);
        score.finalScore += score.recencyScore;
      }
      if (score.frequencyScore !== undefined && !isNaN(score.frequencyScore)) {
        score.frequencyScore = normalizeFrequency(score.frequencyScore);
        score.finalScore += score.frequencyScore;
      }
      if (score.closenessScore !== undefined && !isNaN(score.closenessScore)) {
        score.closenessScore = normalizeCloseness(score.closenessScore);
        score.finalScore += score.closenessScore;
      }
      // ! NEW-SCORER-INSERT-HERE

      // Create a description with all values
      item.description = `(${score.finalScore?.toFixed(2)})`;
      if (score.fuzzyScore !== undefined) {
        item.description += `Fuz: ${score.fuzzyScore?.toFixed(1)} `;
      }
      if (score.closenessScore !== undefined) {
        item.description += `Clo: ${score.closenessScore?.toFixed(1)} `;
      }
      if (score.recencyScore !== undefined) {
        item.description += `Recent: ${score.recencyScore?.toFixed(1)} `;
      }
      if (score.frequencyScore !== undefined) {
        item.description += `Freq: ${score.frequencyScore?.toFixed(1)} `;
      }
      // ! NEW-SCORER-INSERT-HERE
      console.log(`Final Normalized scores for ${item.file}:`, score);
    }

    return items;
  }

  /**
   * Check if a scorer type is enabled
   */
  private isEnabled(type: string): boolean {
    switch (type) {
      case "fuzzy":
        return this.config.enabled.fuzzy;
      case "recency":
        return this.config.enabled.recency;
      case "frequency":
        return this.config.enabled.frequency;
      // case "length":
      //   return this.config.enabled.length;
      // case "path":
      //   return this.config.enabled.path;
      case "closeness":
        return this.config.enabled.closeness;
      // ! NEW-SCORER-INSERT-HERE
      default:
        return false;
    }
  }

  /**
   * Get weight for a scorer type
   */
  private getWeight(type: string): number {
    switch (type) {
      case "fuzzy":
        return this.config.weights.fuzzy;
      case "recency":
        return this.config.weights.recency;
      case "frequency":
        return this.config.weights.frequency;
      // case "length":
      //   return this.config.weights.length;
      // case "path":
      //   return this.config.weights.path;
      case "closeness":
        return this.config.weights.closeness;
      // ! NEW-SCORER-INSERT-HERE
      default:
        return 0;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ScoreConfig {
    return { ...this.config };
  }

  /**
   * Record that a file was opened (for recency/frequency tracking)
   */
  recordFileOpened(fsPath: string): void {
    const recencyScorer = this.getScorer<RecencyScorer>("recency");
    if (recencyScorer) {
      recencyScorer.recordFileOpened(fsPath);
    }

    const frequencyScorer = this.getScorer<FrequencyScorer>("frequency");
    if (frequencyScorer) {
      frequencyScorer.recordFileAccessed(fsPath);
    }
  }
}
