import { IScorer } from "../interface/IScorer";
import { UriExt } from "../../picks/interface/IUriExt";
import { ScoringContext } from "../interface/IContextScorer";

/**
 * Recency scorer - gives higher scores to recently opened files
 */
export class RecencyScorer implements IScorer {
  readonly type = "recency";
  readonly name = "Recent Files";
  readonly enabled = false; // Disabled until we have recency tracking
  readonly defaultWeight = 0.3;
  readonly requiresContext = false;

  private recentFiles: Map<string, number> = new Map(); // fsPath -> timestamp

  calculateScore(input: string, file: UriExt, context?: ScoringContext): number {
    const lastOpened = this.recentFiles.get(file.fsPath);
    if (!lastOpened) {
      return 0;
    }

    // Score based on how recently the file was opened
    // More recent = higher score, with exponential decay
    const hoursSinceOpened = (Date.now() - lastOpened) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 100 * Math.exp(-hoursSinceOpened / 24)); // Decay over 24 hours

    return recencyScore;
  }

  /**
   * Track when a file was opened
   */
  recordFileOpened(fsPath: string): void {
    this.recentFiles.set(fsPath, Date.now());
  }

  /**
   * Clear old entries to prevent memory leaks
   */
  cleanup(olderThanHours: number = 168): void {
    // Default: 1 week
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
    for (const [path, timestamp] of this.recentFiles.entries()) {
      if (timestamp < cutoff) {
        this.recentFiles.delete(path);
      }
    }
  }
}
