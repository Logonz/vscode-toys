import { TextDocument } from "vscode";
import { LANGUAGE_COMMENT_MAP } from "./textCommentLangIds";

/**
 * Get comment patterns for a specific language ID
 */
function getCommentPatternsForLanguage(languageId: string): string[] {
  const commentInfo = LANGUAGE_COMMENT_MAP[languageId] || LANGUAGE_COMMENT_MAP["plaintext"];
  return commentInfo.line || [];
}

/**
 * Get block comment patterns for a specific language ID
 */
function getBlockCommentPatternsForLanguage(languageId: string): { start: string; end: string } | null {
  const commentInfo = LANGUAGE_COMMENT_MAP[languageId] || LANGUAGE_COMMENT_MAP["plaintext"];
  return commentInfo.block || null;
}

/**
 * Export the language comment mapping for external use
 */
export { LANGUAGE_COMMENT_MAP, getCommentPatternsForLanguage, getBlockCommentPatternsForLanguage };

// TODO: Implement support for block comments using the block patterns in the lookup table

/**
 * Helper class to efficiently track comment positions during sequential scanning.
 * Uses VS Code's TextDocument API for O(1) position-to-line conversion and direct line access.
 */
export class CommentTracker {
  private currentCommentStart = -1;
  private lastProcessedLine = -1;
  private commentPatterns: string[];

  constructor(private document: TextDocument, commentPatterns?: string[]) {
    // Use provided patterns or auto-detect from language ID
    this.commentPatterns = commentPatterns || getCommentPatternsForLanguage(document.languageId);
  }

  /**
   * Get the block comment patterns for the document's language
   */
  getBlockCommentPatterns(): { start: string; end: string } | null {
    return getBlockCommentPatternsForLanguage(this.document.languageId);
  }

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
