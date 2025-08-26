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

  calculateScore(input: string, file: UriExt, context?: ScoringContext): number {
    // Return early if no search input provided
    if (!input || input.trim() === "") {
      return 0;
    }

    // Extract just the filename (without path) for separate scoring
    const filename = path.basename(file.fsPath);

    // Score against both custom label AND filename to ensure comprehensive matching
    // Custom labels are user-defined in VS Code and may not contain the actual filename
    // e.g., "src/UserProfile.tsx" might have custom label "Profile Component"
    // We need to score both to catch matches against either the user's label or actual filename
    const rawLabelScore = score(input, file.customLabel);
    const rawFileScore = score(input, filename);

    console.log(`Fuzzy scores for "${filename}":`, {
      label: rawLabelScore,
      file: rawFileScore,
    });

    // Protect against NaN/Infinity values that could break scoring calculations
    // The fzy algorithm might return non-finite values in edge cases
    const safeLabelScore = Number.isFinite(rawLabelScore) ? rawLabelScore : 0;
    const safeFileScore = Number.isFinite(rawFileScore) ? rawFileScore : 0;

    // Combine both scores to get comprehensive fuzzy matching
    // This ensures we can match either:
    // 1. Custom label (user-defined names)
    // 2. Actual filename (for technical searches like file extensions)
    // The normalization process later will scale all fuzzy scores to 0-1 range
    // so absolute values don't matter - only relative scoring between files
    return safeLabelScore + safeFileScore;
  }
}
