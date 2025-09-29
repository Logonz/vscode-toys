import * as vscode from "vscode";
import { AdaptiveCharAssigner } from "../shared/adaptiveCharAssigner";
import { RegularMatch, RegularLabeledMatch } from "../shared/types";
import { BaseMatchFinder } from "../shared/baseMatchFinder";
import { classifyMatchType } from "../shared/functions";

export { RegularMatch, RegularLabeledMatch as LabeledMatch, RegularJumpTarget } from "../shared/types";

export class RegularMatchFinder extends BaseMatchFinder<RegularMatch> {
  /**
   * Create a regular match object
   */
  protected createMatch(
    lineNum: number,
    startChar: number,
    endChar: number,
    pattern: string,
    lineText: string,
    document: vscode.TextDocument
  ): RegularMatch {
    return {
      position: new vscode.Position(lineNum, startChar),
      text: lineText.substring(startChar, endChar),
      pattern: pattern,
      line: lineNum,
      startChar: startChar,
      endChar: endChar,
    };
  }

  /**
   * Filter matches based on configuration
   */
  filterMatches(matches: RegularMatch[], maxMatches: number, minWordLength: number = 0): RegularMatch[] {
    let filtered = matches;

    // Filter by word length if specified
    if (minWordLength > 0) {
      filtered = filtered.filter((match) => match.text.length >= minWordLength);
    }

    // Limit total number of matches
    if (maxMatches > 0) {
      filtered = filtered.slice(0, maxMatches);
    }

    return filtered;
  }
}

export class RegularJumpAssigner {
  private adaptiveAssigner = new AdaptiveCharAssigner();

  /**
   * Assign jump characters to regular matches
   */
  assignJumpChars(
    matches: RegularMatch[],
    cursorPosition: vscode.Position,
    document: vscode.TextDocument
  ): RegularLabeledMatch[] {
    // Convert RegularMatch to DecodedToken format for reusing adaptive assigner
    const pseudoTokens = matches.map((match, index) => ({
      line: match.line,
      startChar: match.startChar,
      length: match.text.length,
      type: classifyMatchType(match, document),
      modifiers: [],
      text: match.text,
    }));

    // Use adaptive assigner to get jump assignments with regular-jump configuration
    const assignments = this.adaptiveAssigner.assignChars(
      pseudoTokens,
      cursorPosition,
      document,
      "vstoys.regular-jump"
    );

    // Convert back to LabeledMatch format
    return assignments.map((assignment, index) => ({
      ...matches[index],
      jumpChar: assignment.chars,
      isSequence: assignment.isSequence,
      text: matches[index].text, // Ensure we preserve the original match text
    }));
  }
}
