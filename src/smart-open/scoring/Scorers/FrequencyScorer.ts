import { IScorer } from "../interface/IScorer";
import { UriExt } from "../../picks/interface/IUriExt";
import { ScoringContext } from "../interface/IContextScorer";

/**
 * Frequency scorer - gives higher scores to frequently accessed files
 */
export class FrequencyScorer implements IScorer {
  readonly type = "frequency";
  readonly name = "File Frequency";
  readonly enabled = false; // Disabled until we have frequency tracking
  readonly defaultWeight = 0.2;
  readonly requiresContext = false;

  private fileFrequency: Map<string, number> = new Map(); // fsPath -> access count

  calculateScore(input: string, file: UriExt, context?: ScoringContext): number {
    const accessCount = this.fileFrequency.get(file.fsPath) || 0;

    // Logarithmic scaling to prevent frequently used files from dominating
    return accessCount > 0 ? Math.log(accessCount + 1) * 10 : 0;
  }

  /**
   * Record that a file was accessed
   */
  recordFileAccessed(fsPath: string): void {
    const current = this.fileFrequency.get(fsPath) || 0;
    this.fileFrequency.set(fsPath, current + 1);
  }

  /**
   * Get the access count for a file
   */
  getAccessCount(fsPath: string): number {
    return this.fileFrequency.get(fsPath) || 0;
  }

  /**
   * Decay frequency counts over time to prevent stale entries from dominating
   */
  decayFrequencies(decayFactor: number = 0.9): void {
    for (const [path, count] of this.fileFrequency.entries()) {
      const newCount = Math.floor(count * decayFactor);
      if (newCount <= 0) {
        this.fileFrequency.delete(path);
      } else {
        this.fileFrequency.set(path, newCount);
      }
    }
  }
}
