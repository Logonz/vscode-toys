import { TextDocument } from "vscode";

// Comment patterns to recognize different types of comments
const patterns = ["//", "#", "--", ";"];

// TODO: Implement support for block comments

/**
 * Helper class to efficiently track comment positions during sequential scanning.
 * Uses VS Code's TextDocument API for O(1) position-to-line conversion and direct line access.
 */
export class CommentTracker {
  private currentCommentStart = -1;
  private lastProcessedLine = -1;

  constructor(private document: TextDocument, private commentPatterns: string[] = patterns) {}

  /**
   * Check if a position is inside a line comment.
   * Uses VS Code's TextDocument API for efficient position-to-line conversion.
   */
  isInComment(position: number): boolean {
    // Convert offset to Position object using VS Code API (O(1) operation)
    const pos = this.document.positionAt(position);
    const lineNumber = pos.line;

    // Only recompute if we're on a different line
    if (lineNumber !== this.lastProcessedLine) {
      this.updateLineInfo(lineNumber);
      this.lastProcessedLine = lineNumber;
    }

    // Check if position is after comment start on this line
    return this.currentCommentStart !== -1 && position >= this.currentCommentStart;
  }

  private updateLineInfo(lineNumber: number): void {
    // Get line text directly using VS Code API (O(1) operation)
    const line = this.document.lineAt(lineNumber);
    const lineText = line.text;
    const lineStartOffset = this.document.offsetAt(line.range.start);

    // Find comment start on this line
    this.currentCommentStart = -1;

    for (const pattern of this.commentPatterns) {
      const commentIndex = lineText.indexOf(pattern);
      if (commentIndex !== -1) {
        this.currentCommentStart = lineStartOffset + commentIndex;
        break; // Use first comment pattern found
      }
    }
  }
}
