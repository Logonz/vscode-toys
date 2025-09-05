import { IScorer } from "./interface/IScorer";
import { UriExt } from "../picks/interface/IUriExt";
import { FileScore, ScoreConfig, DEFAULT_SCORE_CONFIG } from "./interface/IScore";
import { ScoringContext } from "./interface/IContextScorer";
import { FuzzyScorer } from "./Scorers/FuzzyScorer";
import { RecencyScorer } from "./Scorers/RecencyScorer";
import { FrequencyScorer } from "./Scorers/FrequencyScorer";
// import { LengthScorer, PathScorer } from "./PathScorers";
import { ClosenessScorer } from "./Scorers/ClosenessScorer";
import { GitScorer } from "./Scorers/GitScorer";
import * as vscode from "vscode";
import { FileQuickPickItem } from "../picks/interface/IFileQuickPickItem";

/**
 * Main scoring engine that combines multiple scoring algorithms
 */
export class ScoreCalculator {
  private scorers: Map<string, IScorer> = new Map();
  private config: ScoreConfig;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext, config: ScoreConfig = DEFAULT_SCORE_CONFIG) {
    this.config = { ...config };
    this.context = context;
    this.initializeScorers();
  }

  private initializeScorers(): void {
    const scorers = [
      new FuzzyScorer(this.context),
      new RecencyScorer(this.context),
      new FrequencyScorer(this.context),
      // new LengthScorer(this.context),
      // new PathScorer(this.context),
      new ClosenessScorer(this.context), // Add the new closeness scorer
      new GitScorer(this.context), // Add the git co-change scorer
      // ! NEW-SCORER-INSERT-HERE
    ];

    for (const scorer of scorers) {
      this.scorers.set(scorer.type, scorer);
    }
  }

  /**
   * Calculate comprehensive score for a file
   * @returns FileScore or null if file should be hidden
   */
  calculateScore(input: string, file: UriExt, context?: ScoringContext): FileScore | null {
    const scores: Partial<FileScore> = {
      input,
      scoredAt: Date.now(),
    };

    // let finalScore = 0;
    // let totalWeight = 0;

    // Calculate individual scores
    // const scorersStart = performance.now();
    for (const [type, scorer] of this.scorers.entries()) {
      if (!this.isEnabled(type)) {
        continue;
      }

      const result = scorer.calculateScore(input, file, context);

      // If any scorer returns null, hide the file immediately
      if (result === null) {
        return null;
      }

      const score = result;
      const weight = this.getWeight(type); // Store individual score
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
        case "git":
          scores.gitScore = score;
          break;
        // ! NEW-SCORER-INSERT-HERE
      }

      // Contribute to final weighted score
      // finalScore += score * weight;
      // totalWeight += weight;
    }
    // console.log(`Final scores for ${file.fsPath}:`, scores);
    // const scorersEnd = performance.now();
    // console.log(`Scorers took ${(scorersEnd - scorersStart).toFixed(2)}ms for ${file.fsPath}`);
    // Normalize final score
    // scores.finalScore = totalWeight > 0 ? finalScore / totalWeight : 0;

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
      // Only add files that aren't hidden
      if (score !== null) {
        scores.set(file.fsPath, score);
      }
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
      git: { min: Infinity, max: -Infinity },
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
      if (score.gitScore !== undefined && !isNaN(score.gitScore)) {
        scoreRanges.git.min = Math.min(scoreRanges.git.min, score.gitScore);
        scoreRanges.git.max = Math.max(scoreRanges.git.max, score.gitScore);
      }
      // ! NEW-SCORER-INSERT-HERE
    }

    // Between 0-MAX_VALUE, example: 0-100 if MAX_VALUE is 100
    const MAX_VALUE = 100;
    // Threshold for switching from linear to square root normalization for frequency scores
    // Do not use any value below 10 here, 100 is a good value imo.
    const MAX_RAW_BEFORE_NORMALIZATION = MAX_VALUE;
    // Create normalization functions for each score type
    const createNormalizer = (type: string, range: { min: number; max: number }) => {
      // If min is still Infinity, no values were processed
      if (range.min === Infinity) return (val: number) => val;
      const weight = this.getWeight(type);
      const rangeSize = range.max - range.min;
      // If all values are the same, return 0 for all
      if (rangeSize === 0) return (val: number) => 0;

      // Choose normalization strategy based on score type
      switch (type) {
        case "fuzzy":
          // Fuzzy scores are already well-distributed, use linear normalization
          return (val: number) => ((val - range.min) / rangeSize) * MAX_VALUE * weight;

        case "frequency":
          // Hybrid normalization: use raw values for better granularity when max <= threshold,
          // switch to logarithmic normalization for larger ranges to prevent score inflation
          if (range.max <= MAX_RAW_BEFORE_NORMALIZATION) {
            // return (val: number) => ((val - range.min) / rangeSize) * MAX_VALUE * weight;
            return (val: number) => Math.min(Math.max(0, val * weight), MAX_VALUE); // We do min(MAX_VALUE) just for extra safety.
          } else {
            // Use logarithmic normalization for larger ranges to compress high values
            return (val: number) => {
              const logVal = Math.log(val + 1);
              const logMin = Math.log(range.min + 1);
              const logMax = Math.log(range.max + 1);
              const logRange = logMax - logMin;
              if (logRange === 0) return 0;
              return ((logVal - logMin) / logRange) * MAX_VALUE * weight;
            };
          }

        case "git":
          // Count-based scores benefit from logarithmic normalization
          return (val: number) => {
            const logVal = Math.log(val + 1);
            const logMin = Math.log(range.min + 1);
            const logMax = Math.log(range.max + 1);
            const logRange = logMax - logMin;
            if (logRange === 0) return 0;
            return ((logVal - logMin) / logRange) * MAX_VALUE * weight;
          };

        case "recency":
          // Recency scores benefit from square root normalization (between linear and log)
          return (val: number) => {
            const sqrtVal = Math.sqrt(val);
            const sqrtMin = Math.sqrt(range.min);
            const sqrtMax = Math.sqrt(range.max);
            const sqrtRange = sqrtMax - sqrtMin;
            if (sqrtRange === 0) return 0;
            return ((sqrtVal - sqrtMin) / sqrtRange) * MAX_VALUE * weight;
          };

        case "closeness":
        default:
          // Default to linear normalization with slight smoothing
          const smoothingFactor = rangeSize * 0.1; // 10% smoothing
          const adjustedRange = rangeSize + smoothingFactor;
          return (val: number) => ((val - range.min) / adjustedRange) * MAX_VALUE * weight;
      }
    };

    const normalizeFuzzy = createNormalizer("fuzzy", scoreRanges.fuzzy);
    const normalizeRecency = createNormalizer("recency", scoreRanges.recency);
    const normalizeFrequency = createNormalizer("frequency", scoreRanges.frequency);
    const normalizeCloseness = createNormalizer("closeness", scoreRanges.closeness);
    const normalizeGit = createNormalizer("git", scoreRanges.git);
    // ! NEW-SCORER-INSERT-HERE

    // Second pass: Apply normalization to all items
    for (const item of items) {
      const score = item.score;
      if (!score) continue;

      // Initialize final score
      score.finalScore = 0;

      // Normalize each score type
      if (score.fuzzyScore !== undefined && !isNaN(score.fuzzyScore)) {
        score.fuzzyScore = Math.ceil(normalizeFuzzy(score.fuzzyScore)); // Ceil to avoid 0.1 scores
        score.finalScore += score.fuzzyScore;
      }
      if (score.recencyScore !== undefined && !isNaN(score.recencyScore)) {
        score.recencyScore = Math.ceil(normalizeRecency(score.recencyScore)); // Ceil to avoid 0.1 scores
        score.finalScore += score.recencyScore;
      }
      if (score.frequencyScore !== undefined && !isNaN(score.frequencyScore)) {
        score.frequencyScore = Math.ceil(normalizeFrequency(score.frequencyScore)); // Ceil to avoid 0.1 scores
        score.finalScore += score.frequencyScore;
      }
      if (score.closenessScore !== undefined && !isNaN(score.closenessScore)) {
        score.closenessScore = Math.ceil(normalizeCloseness(score.closenessScore)); // Ceil to avoid 0.1 scores
        score.finalScore += score.closenessScore;
      }
      if (score.gitScore !== undefined && !isNaN(score.gitScore)) {
        score.gitScore = Math.ceil(normalizeGit(score.gitScore)); // Ceil to avoid 0.1 scores
        score.finalScore += score.gitScore;
      }
      // ! NEW-SCORER-INSERT-HERE

      // Create a description with all values
      let scoreString = `${score.finalScore?.toFixed(2)} - `;
      if (score.fuzzyScore !== undefined) {
        scoreString += `Fuz: ${score.fuzzyScore}|`;
      }
      if (score.closenessScore !== undefined) {
        scoreString += `Clo: ${score.closenessScore}|`;
      }
      if (score.recencyScore !== undefined) {
        scoreString += `Recent: ${score.recencyScore}|`;
      }
      if (score.frequencyScore !== undefined) {
        scoreString += `Freq: ${score.frequencyScore}|`;
      }
      if (score.gitScore !== undefined) {
        scoreString += `Git: ${score.gitScore}`;
      }
      // ! NEW-SCORER-INSERT-HERE
      item.detail = scoreString;

      // console.log(`Final Normalized scores for ${item.file}:`, score);
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
      case "git":
        return this.config.enabled.git;
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
      case "git":
        return this.config.weights.git;
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
}
