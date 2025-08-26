import { IContextScorer, ScoringContext } from "../interface/IContextScorer";
import { UriExt } from "../../picks/interface/IUriExt";
import { coChangeScores } from "../helpers/git";
import * as vscode from "vscode";

/**
 * GitScorer - Scores files based on git co-change history
 *
 * This scorer analyzes git history to find files that have been
 * modified together with the currently active file, suggesting
 * files that are likely to be related or relevant.
 */
export class GitScorer implements IContextScorer {
  readonly type = "git";
  readonly name = "Git Co-Change Scorer";
  readonly enabled = true;
  readonly defaultWeight = 0.4;
  readonly requiresContext = true; // Requires active editor context
  readonly context?: vscode.ExtensionContext;

  private coChangeCache = new Map<string, Map<string, number>>();
  private cacheTimestamps = new Map<string, number>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(context?: vscode.ExtensionContext) {
    this.context = context;
  }

  calculateScore(input: string, file: UriExt, context?: ScoringContext): number {
    // Only score when we have an active editor context
    if (!context?.activeEditor) {
      return 0;
    }

    if (!context?.activeWorkspaceFolder) {
      return 0;
    }

    const workspaceFolder = context.activeWorkspaceFolder;

    try {
      const repoRoot = workspaceFolder.uri.fsPath;

      // We piggyback on the context being fed into the scoring function
      // to avoid recomputing values unnecessarily

      // Get or compute activeRelativePath (cached in context for performance)
      let activeRelativePath = context.metadata?.activeRelativePath as string;
      if (!activeRelativePath) {
        const activeFile = context.activeEditor.document.uri;
        activeRelativePath = vscode.workspace.asRelativePath(activeFile).replace(/\\/g, "/");
        // Cache it in context for subsequent calls
        if (!context.metadata) context.metadata = {};
        context.metadata.activeRelativePath = activeRelativePath;
      }

      const targetRelativePath = vscode.workspace.asRelativePath(file.uri).replace(/\\/g, "/");

      // Get or compute coChangeMap (cached in context for performance)
      let coChangeMap = context.metadata?.coChangeMap as Map<string, number>;
      if (!coChangeMap) {
        coChangeMap = this.getCoChangeScores(repoRoot, activeRelativePath);
        // Cache it in context for subsequent calls
        if (!context.metadata) context.metadata = {};
        context.metadata.coChangeMap = coChangeMap;
      }

      // Early exit if no co-changes found
      if (coChangeMap.size === 0) {
        return 0;
      }

      // Get the score for the target file
      const rawScore = coChangeMap.get(targetRelativePath) || 0;

      // Normalize the score (logarithmic scaling to prevent very high scores from dominating)
      const normalizedScore = rawScore > 0 ? Math.log(rawScore + 1) : 0;

      return normalizedScore;
    } catch (error) {
      console.error(`GitScorer error for ${file.relativePath}:`, error);
      return 0;
    }
  }

  /**
   * Get co-change scores with caching
   */
  private getCoChangeScores(repoRoot: string, activeRelativePath: string): Map<string, number> {
    // Pre-compute cache key once
    const cacheKey = `${repoRoot}:${activeRelativePath}`;
    const now = Date.now();

    // Check if we have a valid cached result
    const cachedTimestamp = this.cacheTimestamps.get(cacheKey);
    if (cachedTimestamp && now - cachedTimestamp < this.CACHE_DURATION) {
      const cached = this.coChangeCache.get(cacheKey);
      if (cached) {
        console.log(`Using cached co-change scores for ${activeRelativePath}`);
        return cached;
      }
    }

    console.log(`Computing new co-change scores for ${activeRelativePath}`);

    // Calculate new co-change scores
    try {
      const scores = coChangeScores({
        repoRoot,
        targetRelPath: activeRelativePath,
        sinceDays: 365, // Look back 1 year
        maxCommits: 5000, // Reasonable limit for performance
        noMerges: true,
      });

      // Cache the results
      this.coChangeCache.set(cacheKey, scores);
      this.cacheTimestamps.set(cacheKey, now);

      return scores;
    } catch (error) {
      console.error(`Failed to get co-change scores for ${activeRelativePath}:`, error);
      return new Map();
    }
  }

  /**
   * Clear the cache (useful for testing or when git state changes)
   */
  clearCache(): void {
    this.coChangeCache.clear();
    this.cacheTimestamps.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { size: number; oldestEntry: number; newestEntry: number } {
    const timestamps = Array.from(this.cacheTimestamps.values());
    return {
      size: this.coChangeCache.size,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0,
    };
  }
}
