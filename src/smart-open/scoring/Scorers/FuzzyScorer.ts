import * as vscode from "vscode";
import { IScorer } from "../interface/IScorer";
import { UriExt } from "../../picks/interface/IUriExt";
import { ScoringContext } from "../interface/IContextScorer";
import { score } from "../../fzy";
import path from "path";

/**
 * Fuzzy matching scorer using the fzy algorithm
 */
export class FuzzyScorer implements IScorer {
  readonly type = "fuzzy";
  readonly name = "Fuzzy Match";
  readonly enabled = true;
  readonly defaultWeight = 1.0;
  readonly requiresContext = false;
  readonly context?: vscode.ExtensionContext;

  constructor(context?: vscode.ExtensionContext) {
    this.context = context;
  }

  calculateScore(input: string, file: UriExt, context?: ScoringContext): number | null {
    // Return early if no search input provided
    if (!input || input.trim() === "") {
      return 0; // No input means show all files with neutral score
    }

    // Extract just the filename (without path) for separate scoring
    const filename = path.basename(file.fsPath);

    // Split input on whitespace to enable multi-term fuzzy searching
    // This allows searches like "dep cc" to match "deploy_cpp"
    const searchTerms = input
      .trim()
      .split(/\s+/)
      .filter((term) => term.length > 0);

    // console.log(`Calculating fuzzy score for input: "${input}" -> terms:`, searchTerms);

    // Calculate multi-term fuzzy scores for both label and filename
    const labelScore = this.calculateMultiTermScore(searchTerms, file.customLabel);
    const fileScore = this.calculateMultiTermScore(searchTerms, filename);

    // console.log(`Fuzzy scores for "${filename}":`, {
    //   label: labelScore,
    //   file: fileScore,
    //   terms: searchTerms,
    // });

    // If both targets fail to match all terms, hide the file
    if (labelScore === null && fileScore === null) {
      // console.log(`Hiding file "${filename}" - no fuzzy match for terms:`, searchTerms);
      return null; // Hide this file
    }

    // Combine both scores (treating null as 0)
    const combinedScore = (labelScore || 0) + (fileScore || 0);
    return combinedScore;
  }

  /**
   * Calculate fuzzy score for multiple search terms against a target string
   * All terms must match for a non-zero score (AND logic)
   * @returns number score if match found, null if no match (hide file)
   */
  private calculateMultiTermScore(searchTerms: string[], target: string): number | null {
    if (searchTerms.length === 0) {
      return null; // No terms means hide
    }

    // For single term, use simple logic
    if (searchTerms.length === 1) {
      const rawScore = score(searchTerms[0], target);
      const safeScore = Number.isFinite(rawScore) ? rawScore : 0;

      // Hide file if single term doesn't match
      if (safeScore <= 0) {
        return null;
      }

      return safeScore;
    }

    // For multiple terms, each term must have a positive score
    const termScores: number[] = [];

    for (const term of searchTerms) {
      const rawScore = score(term, target);
      const safeScore = Number.isFinite(rawScore) ? rawScore : 0;

      // console.log(`Term "${term}" vs "${target}": score = ${safeScore}`);

      // If any term doesn't match (score <= 0), the entire match fails
      if (safeScore <= 0) {
        // console.log(`Multi-term search failed: term "${term}" didn't match "${target}"`);
        return null; // Hide this file for this target
      }

      termScores.push(safeScore);
    }

    // Combine scores: use simple average for predictable results
    const avgScore = termScores.reduce((acc, score) => acc + score, 0) / termScores.length;
    // console.log(`Multi-term scores for "${target}":`, termScores, `-> avg: ${avgScore}`);
    return avgScore;
  }
}
