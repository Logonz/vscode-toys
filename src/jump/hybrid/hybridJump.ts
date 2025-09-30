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
    const availableArray = Array.from(availableChars);
    
    if (availableArray.length === 0) {
      // No available characters, return as-is
      return assignments;
    }

    // PHASE 1: Fix excluded character conflicts
    const usedChars = new Set<string>();
    const conflictingAssignments: number[] = [];

    // First pass: identify conflicts with excluded chars
    assignments.forEach((assignment, index) => {
      let hasConflict = false;
      
      if (assignment.chars.length === 1 && excludedChars.has(assignment.chars.toLowerCase())) {
        // Single character conflicts
        hasConflict = true;
      } else if (assignment.isSequence && assignment.chars.length >= 1) {
        // Check if the first character of a sequence conflicts
        const firstChar = assignment.chars[0].toLowerCase();
        if (excludedChars.has(firstChar)) {
          hasConflict = true;
        }
      }
      
      if (hasConflict) {
        conflictingAssignments.push(index);
      } else {
        usedChars.add(assignment.chars.toLowerCase());
      }
    });

    // Generate pool of unused characters for reassignment
    let unusedSingleChars: string[] = [];
    let unusedSequenceChars: string[] = [];

    // Find unused single characters
    for (const char of availableArray) {
      if (!usedChars.has(char.toLowerCase())) {
        unusedSingleChars.push(char);
      }
    }

    // Generate unused sequences
    for (const firstChar of availableArray) {
      for (const secondChar of availableArray) {
        const sequence = firstChar + secondChar;
        if (!usedChars.has(sequence.toLowerCase())) {
          unusedSequenceChars.push(sequence);
        }
      }
    }

    // Reassign conflicting assignments
    let singleCharIndex = 0;
    let sequenceIndex = 0;

    for (const index of conflictingAssignments) {
      const wasSequence = assignments[index].isSequence;
      
      if (!wasSequence && singleCharIndex < unusedSingleChars.length) {
        const newChar = unusedSingleChars[singleCharIndex];
        assignments[index] = {
          ...assignments[index],
          chars: newChar,
          isSequence: false,
        };
        usedChars.add(newChar.toLowerCase());
        singleCharIndex++;
      } else if (sequenceIndex < unusedSequenceChars.length) {
        const newSequence = unusedSequenceChars[sequenceIndex];
        assignments[index] = {
          ...assignments[index],
          chars: newSequence,
          isSequence: true,
        };
        usedChars.add(newSequence.toLowerCase());
        sequenceIndex++;
      } else {
        const fallbackSequence = this.generateFallbackSequence(availableArray, usedChars);
        assignments[index] = {
          ...assignments[index],
          chars: fallbackSequence,
          isSequence: true,
        };
        usedChars.add(fallbackSequence.toLowerCase());
      }
    }

    // PHASE 2: Fix single-char vs sequence first-char conflicts
    // Build a map of sequence first characters
    const sequenceFirstChars = new Set<string>();
    assignments.forEach((assignment) => {
      if (assignment.isSequence && assignment.chars.length >= 1) {
        sequenceFirstChars.add(assignment.chars[0].toLowerCase());
      }
    });

    // Find single-char assignments that conflict with sequence first chars
    const singleVsSequenceConflicts: number[] = [];
    assignments.forEach((assignment, index) => {
      if (!assignment.isSequence && sequenceFirstChars.has(assignment.chars.toLowerCase())) {
        singleVsSequenceConflicts.push(index);
      }
    });

    // Rebuild unused single chars pool, excluding sequence first chars
    unusedSingleChars = [];
    for (const char of availableArray) {
      const lowerChar = char.toLowerCase();
      if (!usedChars.has(lowerChar) && !sequenceFirstChars.has(lowerChar)) {
        unusedSingleChars.push(char);
      }
    }

    // Reassign conflicting single-char assignments
    singleCharIndex = 0;
    for (const index of singleVsSequenceConflicts) {
      // Remove old assignment from usedChars
      usedChars.delete(assignments[index].chars.toLowerCase());
      
      if (singleCharIndex < unusedSingleChars.length) {
        const newChar = unusedSingleChars[singleCharIndex];
        assignments[index] = {
          ...assignments[index],
          chars: newChar,
          isSequence: false,
        };
        usedChars.add(newChar.toLowerCase());
        singleCharIndex++;
      } else {
        // If we run out of single chars, convert to a unique sequence
        const uniqueSequence = this.generateFallbackSequence(availableArray, usedChars);
        assignments[index] = {
          ...assignments[index],
          chars: uniqueSequence,
          isSequence: true,
        };
        usedChars.add(uniqueSequence.toLowerCase());
      }
    }

    return assignments;
  }

  /**
   * Generate a fallback sequence when we run out of pre-generated options
   */
  private generateFallbackSequence(availableChars: string[], usedChars: Set<string>): string {
    // Try to find any unused combination
    for (const first of availableChars) {
      for (const second of availableChars) {
        for (const third of availableChars) {
          const seq = first + second + third;
          if (!usedChars.has(seq.toLowerCase())) {
            return seq;
          }
        }
      }
    }
    // Ultimate fallback - just use first two chars with a number
    return availableChars[0] + availableChars[0] + Math.random().toString(36).substr(2, 1);
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
