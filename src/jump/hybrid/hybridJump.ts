import * as vscode from "vscode";
import { AdaptiveCharAssigner, JumpAssignment } from "../shared/adaptiveCharAssigner";
import { HybridMatch, HybridLabeledMatch } from "../shared/types";
import { BaseMatchFinder } from "../shared/baseMatchFinder";
import { classifyMatchType } from "../shared/functions";

export { HybridMatch, HybridLabeledMatch as LabeledMatch, HybridJumpTarget } from "../shared/types";

export class HybridMatchFinder extends BaseMatchFinder<HybridMatch> {
  /**
   * Create a hybrid match object with additional context fields
   */
  protected createMatch(
    lineNum: number,
    startChar: number,
    endChar: number,
    pattern: string,
    lineText: string,
    document: vscode.TextDocument
  ): HybridMatch {
    const fullWord = this.findFullWord(lineText, startChar, endChar);
    const nextChar = endChar < lineText.length ? lineText[endChar] : "";

    return {
      position: new vscode.Position(lineNum, startChar),
      text: lineText.substring(startChar, endChar),
      pattern: pattern,
      line: lineNum,
      startChar: startChar,
      endChar: endChar,
      fullWord: fullWord,
      nextChar: nextChar,
    };
  }

  /**
   * Filter matches based on configuration
   */
  filterMatches(matches: HybridMatch[], maxMatches: number, minWordLength: number = 0): HybridMatch[] {
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

export class HybridJumpAssigner {
  private adaptiveAssigner = new AdaptiveCharAssigner();

  /**
   * Assign jump characters to hybrid matches
   */
  assignJumpChars(
    matches: HybridMatch[],
    cursorPosition: vscode.Position,
    document: vscode.TextDocument,
    excludedChars: Set<string> = new Set()
  ): HybridLabeledMatch[] {
    // Convert HybridMatch to DecodedToken format for reusing adaptive assigner
    const pseudoTokens = matches.map((match, index) => ({
      line: match.line,
      startChar: match.startChar,
      length: match.text.length,
      type: classifyMatchType(match, document),
      modifiers: [],
      text: match.text,
    }));

    // Use adaptive assigner to get jump assignments with hybrid-jump configuration
    let assignments = this.adaptiveAssigner.assignChars(pseudoTokens, cursorPosition, document, "vstoys.hybrid-jump");

    // Post-process assignments to handle excluded characters
    if (excludedChars.size > 0) {
      assignments = this.reassignConflictingChars(assignments, excludedChars);
    }

    // Convert back to LabeledMatch format
    return assignments.map((assignment, index) => ({
      ...matches[index],
      jumpChar: assignment.chars,
      isSequence: assignment.isSequence,
      text: matches[index].text, // Ensure we preserve the original match text
    }));
  }

  /**
   * Reassign jump characters that conflict with excluded characters
   */
  private reassignConflictingChars(assignments: JumpAssignment[], excludedChars: Set<string>): JumpAssignment[] {
    const availableChars = this.getAvailableChars(excludedChars);
    const conflictingAssignments: number[] = [];

    // Find assignments that conflict with excluded characters
    assignments.forEach((assignment, index) => {
      if (assignment.chars.length === 1 && excludedChars.has(assignment.chars.toLowerCase())) {
        conflictingAssignments.push(index);
      }
    });

    // Reassign conflicting characters
    let availableIndex = 0;
    const availableArray = Array.from(availableChars);

    for (const index of conflictingAssignments) {
      if (availableIndex < availableArray.length) {
        assignments[index] = {
          ...assignments[index],
          chars: availableArray[availableIndex],
          isSequence: false,
        };
        availableIndex++;
      } else {
        // Fallback to sequences if we run out of single characters
        const sequenceIndex = availableIndex - availableArray.length;
        const firstChar = availableArray[sequenceIndex % availableArray.length];
        const secondChar = availableArray[(sequenceIndex + 1) % availableArray.length];
        assignments[index] = {
          ...assignments[index],
          chars: firstChar + secondChar,
          isSequence: true,
        };
        availableIndex++;
      }
    }

    return assignments;
  }

  /**
   * Get available characters excluding conflicting ones
   */
  private getAvailableChars(excludedChars: Set<string>): Set<string> {
    const config = vscode.workspace.getConfiguration("vstoys.hybrid-jump");
    const jumpCharacters = config.get<string>("jumpCharacters", "fjdkslaghrueiwoncmvFJDKSLAGHRUEIWONCMV");
    const allChars = new Set(jumpCharacters.split(""));
    const available = new Set<string>();

    for (const char of allChars) {
      if (!excludedChars.has(char.toLowerCase())) {
        available.add(char);
      }
    }

    return available;
  }
}
