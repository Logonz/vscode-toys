import * as vscode from "vscode";
import { BaseMatch } from "./types";

/**
 * Abstract base class for all match finders
 * Provides common functionality for finding and processing matches
 */
export abstract class BaseMatchFinder<T extends BaseMatch> {
  /**
   * Find all occurrences of pattern in visible ranges
   */
  findMatches(pattern: string, editor: vscode.TextEditor, caseSensitive: boolean = false): T[] {
    if (pattern.length === 0) return [];

    const matches: T[] = [];
    const visibleRanges = editor.visibleRanges;

    for (const range of visibleRanges) {
      this.findMatchesInRange(pattern, editor.document, range, caseSensitive, matches);
    }

    return this.sortByDistanceFromCursor(matches, editor.selection.active);
  }

  /**
   * Find matches within a specific range - implemented by subclasses
   */
  protected findMatchesInRange(
    pattern: string,
    document: vscode.TextDocument,
    range: vscode.Range,
    caseSensitive: boolean,
    matches: T[]
  ): void {
    const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();

    for (let lineNum = range.start.line; lineNum <= range.end.line; lineNum++) {
      const line = document.lineAt(lineNum);
      const lineText = caseSensitive ? line.text : line.text.toLowerCase();

      let startIndex = 0;
      // For first and last lines, respect range boundaries
      if (lineNum === range.start.line) {
        startIndex = range.start.character;
      }
      const endIndex = lineNum === range.end.line ? range.end.character : line.text.length;

      let matchIndex = lineText.indexOf(searchPattern, startIndex);
      while (matchIndex !== -1 && matchIndex < endIndex) {
        const endChar = matchIndex + pattern.length;

        // Make sure the match doesn't extend beyond the range
        if (endChar <= endIndex) {
          const match = this.createMatch(
            lineNum,
            matchIndex,
            endChar,
            pattern,
            line.text,
            document
          );
          matches.push(match);
        }

        matchIndex = lineText.indexOf(searchPattern, matchIndex + 1);
      }
    }
  }

  /**
   * Create a match object - implemented by subclasses to add specific fields
   */
  protected abstract createMatch(
    lineNum: number,
    startChar: number,
    endChar: number,
    pattern: string,
    lineText: string,
    document: vscode.TextDocument
  ): T;

  /**
   * Sort matches by distance from cursor position
   */
  protected sortByDistanceFromCursor(matches: T[], cursorPos: vscode.Position): T[] {
    return matches.sort((a, b) => {
      const distanceA = this.calculateDistance(a.position, cursorPos);
      const distanceB = this.calculateDistance(b.position, cursorPos);
      return distanceA - distanceB;
    });
  }

  /**
   * Calculate distance between two positions
   */
  protected calculateDistance(pos1: vscode.Position, pos2: vscode.Position): number {
    const lineDiff = Math.abs(pos1.line - pos2.line);
    const charDiff = Math.abs(pos1.character - pos2.character);

    // Weight line differences more heavily than character differences
    return lineDiff * 1000 + charDiff;
  }

  /**
   * Classify match type (common utility)
   */
  protected classifyMatchType(match: T, document: vscode.TextDocument): string {
    const line = document.lineAt(match.line);
    const beforeChar = match.startChar > 0 ? line.text[match.startChar - 1] : "";
    const afterChar = match.endChar < line.text.length ? line.text[match.endChar] : "";

    const isWordBoundaryBefore = !beforeChar || /\W/.test(beforeChar);
    const isWordBoundaryAfter = !afterChar || /\W/.test(afterChar);

    if (isWordBoundaryBefore && isWordBoundaryAfter) {
      return "word";
    } else if (isWordBoundaryBefore) {
      return "prefix";
    } else if (isWordBoundaryAfter) {
      return "suffix";
    } else {
      return "substring";
    }
  }

  /**
   * Find the full word containing the match (utility for hybrid mode)
   */
  protected findFullWord(lineText: string, startChar: number, endChar: number): string {
    // Find word boundaries
    let wordStart = startChar;
    let wordEnd = endChar;

    // Expand backwards to word boundary
    while (wordStart > 0 && /\w/.test(lineText[wordStart - 1])) {
      wordStart--;
    }

    // Expand forwards to word boundary
    while (wordEnd < lineText.length && /\w/.test(lineText[wordEnd])) {
      wordEnd++;
    }

    return lineText.substring(wordStart, wordEnd);
  }
}