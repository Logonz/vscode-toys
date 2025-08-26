import { IScorer } from "../interface/IScorer";
import { UriExt } from "../../picks/IUriExt";
import { ScoringContext } from "../interface/IContextScorer";
import { score } from "../../fzy";

/**
 * Fuzzy matching scorer using the fzy algorithm
 */
export class FuzzyScorer implements IScorer {
  readonly type = "fuzzy";
  readonly name = "Fuzzy Match";
  readonly enabled = true;
  readonly defaultWeight = 1.0;
  readonly requiresContext = false;

  calculateScore(input: string, file: UriExt, context?: ScoringContext): number {
    if (!input || input.trim() === "") {
      return 0;
    }

    return score(input, file.customLabel) || 0;
  }
}
