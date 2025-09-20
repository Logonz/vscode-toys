import * as vscode from "vscode";
import { AdaptiveCharAssigner, JumpAssignment } from "../shared/adaptiveCharAssigner";
import { pickColorType } from "../../helpers/pickColorType";

export interface RegularMatch {
  position: vscode.Position;
  text: string;
  pattern: string;
  line: number;
  startChar: number;
  endChar: number;
}

export interface LabeledMatch extends RegularMatch {
  jumpChar: string;
  isSequence: boolean;
}

export interface RegularJumpTarget {
  match: RegularMatch;
  position: vscode.Position;
  char: string;
}

export class RegularMatchFinder {
  /**
   * Find all occurrences of pattern in visible ranges
   */
  findMatches(pattern: string, editor: vscode.TextEditor, caseSensitive: boolean = false): RegularMatch[] {
    if (pattern.length === 0) return [];

    const matches: RegularMatch[] = [];
    const visibleRanges = editor.visibleRanges;

    for (const range of visibleRanges) {
      this.findMatchesInRange(pattern, editor.document, range, caseSensitive, matches);
    }

    return this.sortByDistanceFromCursor(matches, editor.selection.active);
  }

  /**
   * Find matches within a specific range
   */
  private findMatchesInRange(
    pattern: string,
    document: vscode.TextDocument,
    range: vscode.Range,
    caseSensitive: boolean,
    matches: RegularMatch[]
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
          matches.push({
            position: new vscode.Position(lineNum, matchIndex),
            text: line.text.substring(matchIndex, endChar),
            pattern: pattern,
            line: lineNum,
            startChar: matchIndex,
            endChar: endChar,
          });
        }

        matchIndex = lineText.indexOf(searchPattern, matchIndex + 1);
      }
    }
  }

  /**
   * Sort matches by distance from cursor position
   */
  private sortByDistanceFromCursor(matches: RegularMatch[], cursorPos: vscode.Position): RegularMatch[] {
    return matches.sort((a, b) => {
      const distanceA = this.calculateDistance(a.position, cursorPos);
      const distanceB = this.calculateDistance(b.position, cursorPos);
      return distanceA - distanceB;
    });
  }

  /**
   * Calculate distance between two positions
   */
  private calculateDistance(pos1: vscode.Position, pos2: vscode.Position): number {
    const lineDiff = Math.abs(pos1.line - pos2.line);
    const charDiff = pos1.line === pos2.line ? Math.abs(pos1.character - pos2.character) : 0;

    // Weight line differences more heavily than character differences
    return lineDiff * 100 + charDiff;
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

  /**
   * Check if match is at word boundary
   */
  isAtWordBoundary(match: RegularMatch, document: vscode.TextDocument): boolean {
    const line = document.lineAt(match.line).text;

    // Check character before match
    const charBefore = match.startChar > 0 ? line[match.startChar - 1] : " ";
    const charAfter = match.endChar < line.length ? line[match.endChar] : " ";

    return this.isWordBoundaryChar(charBefore) && this.isWordBoundaryChar(charAfter);
  }

  private isWordBoundaryChar(char: string): boolean {
    // Word boundary characters: whitespace, punctuation, start/end of line
    return /\s|[^\w]/.test(char);
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
  ): LabeledMatch[] {
    // Convert RegularMatch to DecodedToken format for reusing adaptive assigner
    const pseudoTokens = matches.map((match, index) => ({
      line: match.line,
      startChar: match.startChar,
      length: match.text.length,
      type: this.classifyMatchType(match, document),
      modifiers: [],
      text: match.text,
    }));

    // Use adaptive assigner to get jump assignments
    const assignments = this.adaptiveAssigner.assignChars(pseudoTokens, cursorPosition, document);

    // Convert back to LabeledMatch format
    return assignments.map((assignment, index) => ({
      ...matches[index],
      jumpChar: assignment.chars,
      isSequence: assignment.isSequence,
      text: matches[index].text, // Ensure we preserve the original match text
    }));
  }

  /**
   * Classify match type for priority scoring
   */
  private classifyMatchType(match: RegularMatch, document: vscode.TextDocument): string {
    // Simple heuristics for match classification
    if (this.isAtWordStart(match, document)) {
      if (/^[A-Z]/.test(match.text)) {
        return "class"; // Likely class or type name
      }
      if (/^[a-z_][a-zA-Z0-9_]*$/.test(match.text)) {
        return "variable"; // Likely variable name
      }
    }

    return "property"; // Default to medium priority
  }

  private isAtWordStart(match: RegularMatch, document: vscode.TextDocument): boolean {
    const line = document.lineAt(match.line).text;
    const charBefore = match.startChar > 0 ? line[match.startChar - 1] : " ";
    return /\s|[^\w]/.test(charBefore);
  }
}

export class RegularJumpDecorationManager {
  private patternDecorationType: vscode.TextEditorDecorationType | null = null;
  private primaryMatchDecorationType: vscode.TextEditorDecorationType | null = null;
  private secondaryMatchDecorationType: vscode.TextEditorDecorationType | null = null;
  private jumpLabelDecorationType: vscode.TextEditorDecorationType | null = null;

  /**
   * Create decoration types with theme-aware colors
   */
  createDecorationTypes(config: vscode.WorkspaceConfiguration): void {
    this.disposeDecorations();

    const primaryForegroundColor = config.get<string>("primaryForegroundColor", "editor.foreground");
    const primaryMatchColor = config.get<string>("primaryMatchColor", "editor.findMatchHighlightBackground");
    const secondaryForegroundColor = config.get<string>("secondaryForegroundColor", "editor.foreground");
    const secondaryMatchColor = config.get<string>("secondaryMatchColor", "editor.findMatchBackground");
    const jumpLabelBackgroundColor = config.get<string>("jumpLabelBackgroundColor", "activityBarBadge.background");
    const jumpLabelForegroundColor = config.get<string>("jumpLabelForegroundColor", "activityBarBadge.foreground");
    const primaryBorderColor = config.get<string>("primaryBorderColor", "");

    // Pattern decoration (shows typed characters) - not used when we have primary/secondary
    this.patternDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: pickColorType(primaryMatchColor),
    });

    // Primary match decoration (current/first match)
    this.primaryMatchDecorationType = vscode.window.createTextEditorDecorationType({
      // backgroundColor: pickColorType(primaryMatchColor),
      before: {
        color: pickColorType(primaryForegroundColor),
        backgroundColor: pickColorType(primaryMatchColor),
        textDecoration: "none; position: absolute; z-index: 2;",
        border: primaryBorderColor == "" ? undefined : "1px solid",
        borderColor: primaryBorderColor ? pickColorType(primaryBorderColor) : undefined,
        margin: primaryBorderColor == "" ? undefined : "-1px 0 0 -1px",
      },
    });

    // Secondary matches decoration
    this.secondaryMatchDecorationType = vscode.window.createTextEditorDecorationType({
      // backgroundColor: pickColorType(secondaryMatchColor),
      before: {
        color: pickColorType(secondaryForegroundColor),
        backgroundColor: pickColorType(secondaryMatchColor),
        textDecoration: "none; position: absolute; z-index: 2;",
      },
    });

    // Jump label decoration
    this.jumpLabelDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        backgroundColor: pickColorType(jumpLabelBackgroundColor),
        color: pickColorType(jumpLabelForegroundColor),
        textDecoration: "none;position:absolute;z-index:999999;",
        margin: "-1px 0 0 3px", // (Manually adjusted for the border, so 0 0 0 4px is the real value.
        border: primaryBorderColor == "" ? undefined : "1px dotted",
        borderColor: primaryBorderColor ? pickColorType(primaryBorderColor) : undefined,
      },
    });
  }

  /**
   * Apply decorations to editor
   */
  applyDecorations(
    editor: vscode.TextEditor,
    labeledMatches: LabeledMatch[],
    currentPattern: string,
    primaryMatchIndex: number = 0
  ): void {
    if (
      !this.patternDecorationType ||
      !this.primaryMatchDecorationType ||
      !this.secondaryMatchDecorationType ||
      !this.jumpLabelDecorationType
    ) {
      return;
    }

    // Pattern decorations (provide background only - text will be overlaid by primary/secondary)
    const patternDecorations = labeledMatches.map((match) => ({
      range: new vscode.Range(
        new vscode.Position(match.line, match.startChar),
        new vscode.Position(match.line, match.endChar)
      ),
    }));

    // Primary match decoration
    const primaryMatch = labeledMatches[primaryMatchIndex];
    const primaryDecorations = primaryMatch
      ? [
          {
            range: new vscode.Range(
              // Adjust the start position to account for the space we add below
              new vscode.Position(
                primaryMatch.line,
                primaryMatch.startChar < 1 ? primaryMatch.startChar : Math.max(primaryMatch.startChar - 1, 0)
              ),
              new vscode.Position(primaryMatch.line, primaryMatch.endChar)
            ),
            renderOptions: {
              before: {
                // only add the no-break-space character if there is space for it.
                contentText: (primaryMatch.startChar < 1 ? "" : "\u00A0") + primaryMatch.text,
              },
            },
          },
        ]
      : [];

    // Secondary matches decorations
    const secondaryDecorations = labeledMatches
      .filter((_, index) => index !== primaryMatchIndex)
      .map((match) => ({
        range: new vscode.Range(
          new vscode.Position(match.line, match.startChar),
          new vscode.Position(match.line, match.endChar)
        ),
        renderOptions: {
          before: {
            contentText: match.text,
          },
        },
      }));

    // Jump label decorations - position AFTER the match (Flash.nvim style)
    const jumpLabelDecorations = labeledMatches.map((match) => ({
      range: new vscode.Range(
        new vscode.Position(match.line, match.endChar),
        new vscode.Position(match.line, match.endChar)
      ),
      renderOptions: {
        after: {
          // contentText: "\u00A0" + match.jumpChar + "\u00A0",
          contentText: match.jumpChar,
        },
      },
    }));

    // Apply all decorations
    editor.setDecorations(this.patternDecorationType, patternDecorations);
    editor.setDecorations(this.primaryMatchDecorationType, primaryDecorations);
    editor.setDecorations(this.secondaryMatchDecorationType, secondaryDecorations);
    editor.setDecorations(this.jumpLabelDecorationType, jumpLabelDecorations);
  }

  /**
   * Clear all decorations
   */
  clearDecorations(editor: vscode.TextEditor): void {
    if (this.patternDecorationType) {
      editor.setDecorations(this.patternDecorationType, []);
    }
    if (this.primaryMatchDecorationType) {
      editor.setDecorations(this.primaryMatchDecorationType, []);
    }
    if (this.secondaryMatchDecorationType) {
      editor.setDecorations(this.secondaryMatchDecorationType, []);
    }
    if (this.jumpLabelDecorationType) {
      editor.setDecorations(this.jumpLabelDecorationType, []);
    }
  }

  /**
   * Dispose all decoration types
   */
  disposeDecorations(): void {
    if (this.patternDecorationType) {
      this.patternDecorationType.dispose();
      this.patternDecorationType = null;
    }
    if (this.primaryMatchDecorationType) {
      this.primaryMatchDecorationType.dispose();
      this.primaryMatchDecorationType = null;
    }
    if (this.secondaryMatchDecorationType) {
      this.secondaryMatchDecorationType.dispose();
      this.secondaryMatchDecorationType = null;
    }
    if (this.jumpLabelDecorationType) {
      this.jumpLabelDecorationType.dispose();
      this.jumpLabelDecorationType = null;
    }
  }
}
