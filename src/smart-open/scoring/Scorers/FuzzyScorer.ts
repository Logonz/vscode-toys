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

  calculateScore(input: string, file: UriExt, context?: ScoringContext): number {
    // Return early if no search input provided
    if (!input || input.trim() === "") {
      return 0; // No input means neutral score
    }

    // Extract just the filename (without path) for separate scoring
    const filename = path.basename(file.fsPath);

    // Split input on whitespace to enable multi-term fuzzy searching
    // This allows searches like "dep cc" to match "deploy_cpp"
    const searchTerms = input
      .trim()
      .split(/\s+/)
      .filter((term) => term.length > 0);

    let labelScore = 0;
    let fileScore = 0;

    // Score all terms against the custom label
    for (const term of searchTerms) {
      const rawScore = score(term, file.customLabel);
      const safeScore = Number.isFinite(rawScore) ? rawScore : 0;
      // This normalizes the score by length not to not favor longer terms
      // ! IN TESTING
      const normalizedScore = term.length > 0 ? safeScore / Math.log(term.length + 1) : safeScore;
      labelScore += normalizedScore;
      // labelScore += safeScore;
    }

    // Score all terms against the filename
    for (const term of searchTerms) {
      const rawScore = score(term, filename);
      const safeScore = Number.isFinite(rawScore) ? rawScore : 0;
      // This normalizes the score by length not to not favor longer terms
      // ! IN TESTING
      const normalizedScore = term.length > 0 ? safeScore / Math.log(term.length + 1) : safeScore;
      fileScore += normalizedScore;
      // fileScore += safeScore;
    }

    // Return the combined score
    return labelScore + fileScore;
  }
}
