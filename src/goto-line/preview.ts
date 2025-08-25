import * as vscode from "vscode";

/**
 * @param inputColor Takes a theme ID (like `editor.background`) or color string (like `#ffffff`) and returns vscode.ThemeColor or unchanged color string
 */
function pickColorType(inputColor: string): vscode.ThemeColor | string {
  if (/[a-z]+\.[a-z]+/i.test(inputColor)) {
    return new vscode.ThemeColor(inputColor);
  } else {
    return inputColor;
  }
}

/**
 * Manages preview decorations for goto-line operations
 */
export class GotoLinePreview {
  private normalDecorationType: vscode.TextEditorDecorationType;
  private deleteDecorationType: vscode.TextEditorDecorationType;
  private activeEditor: vscode.TextEditor | undefined;
  // editor.selectionBackground
  // editor.selectionBorder
  constructor() {
    // Create decoration type for normal preview highlighting
    this.normalDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: pickColorType('editor.wordHighlightBackground'),
      // borderColor: pickColorType('editor.wordHighlightBackground'),
      // borderWidth: '1px',
      // borderStyle: 'solid',
      isWholeLine: true,
      overviewRulerColor: pickColorType('editor.wordHighlightBackground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right
    });

    // Create decoration type for delete preview highlighting
    this.deleteDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: pickColorType('inputValidation.errorBackground'),
      // borderColor: pickColorType('inputValidation.errorBackground'),
      // borderWidth: '1px',
      // borderStyle: 'solid',
      isWholeLine: true,
      overviewRulerColor: pickColorType('inputValidation.errorBackground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right
    });
  }

  /**
   * Preview line selection for absolute line navigation
   * @param editor The text editor to preview in
   * @param targetLine The target line number (1-based)
   * @param args Command arguments that might include select/delete flags
   */
  public previewAbsoluteLineSelection(
    editor: vscode.TextEditor,
    targetLine: number,
    args?: any
  ): void {
    this.activeEditor = editor;

    if (!args?.select && !args?.delete) {
      // Just show the target line
      this.showSingleLinePreview(editor, targetLine, args);
      return;
    }

    // Show selection preview
    const currentLine = editor.selection.active.line + 1; // Convert to 1-based
    this.showSelectionPreview(editor, currentLine, targetLine, args);
  }

  /**
   * Preview line selection for relative line navigation
   * @param editor The text editor to preview in
   * @param relativeOffset The relative offset (positive for down, negative for up)
   * @param args Command arguments that might include select/delete flags
   */
  public previewRelativeLineSelection(
    editor: vscode.TextEditor,
    relativeOffset: number,
    args?: any
  ): void {
    this.activeEditor = editor;

    const currentLine = editor.selection.active.line + 1; // Convert to 1-based
    const targetLine = currentLine + relativeOffset;

    if (!args?.select && !args?.delete) {
      // Just show the target line
      this.showSingleLinePreview(editor, targetLine, args);
      return;
    }

    // Show selection preview
    this.showSelectionPreview(editor, currentLine, targetLine, args);
  }

  /**
   * Show preview for a single line (cursor movement only)
   */
  private showSingleLinePreview(editor: vscode.TextEditor, targetLine: number, args?: any): void {
    const totalLines = editor.document.lineCount;

    // Validate line bounds
    if (targetLine < 1 || targetLine > totalLines) {
      this.clearPreview();
      return;
    }

    const targetLineIndex = targetLine - 1; // Convert to 0-based
    const range = new vscode.Range(targetLineIndex, 0, targetLineIndex, 0);

    // Use appropriate decoration type
    const decorationType = args?.delete ? this.deleteDecorationType : this.normalDecorationType;
    editor.setDecorations(decorationType, [{ range }]);
  }

  /**
   * Show preview for line selection
   */
  private showSelectionPreview(editor: vscode.TextEditor, fromLine: number, toLine: number, args?: any): void {
    const totalLines = editor.document.lineCount;

    // Validate line bounds
    if (toLine < 1 || toLine > totalLines) {
      this.clearPreview();
      return;
    }

    const decorations: vscode.DecorationOptions[] = [];

    // Determine selection direction and range
    const startLine = Math.min(fromLine, toLine);
    const endLine = Math.max(fromLine, toLine);

    // Convert to 0-based indices
    const startLineIndex = startLine - 1;
    const endLineIndex = endLine - 1;

    if (toLine > fromLine) {
      // Selecting downward - select to end of target line (inclusive)
      const endLineText = editor.document.lineAt(endLineIndex);
      const range = new vscode.Range(
        startLineIndex, 0,
        endLineIndex, endLineText.text.length
      );
      decorations.push({ range });
    } else if (toLine < fromLine) {
      // Selecting upward - select to beginning of target line
      const range = new vscode.Range(
        endLineIndex, 0,
        startLineIndex, editor.document.lineAt(startLineIndex).text.length
      );
      decorations.push({ range });
    } else {
      // Same line - just highlight the current line
      const range = new vscode.Range(startLineIndex, 0, startLineIndex, 0);
      decorations.push({ range });
    }

    // Use appropriate decoration type
    const decorationType = args?.delete ? this.deleteDecorationType : this.normalDecorationType;
    editor.setDecorations(decorationType, decorations);
  }  /**
   * Clear all preview decorations
   */
  public clearPreview(): void {
    if (this.activeEditor) {
      this.activeEditor.setDecorations(this.normalDecorationType, []);
      this.activeEditor.setDecorations(this.deleteDecorationType, []);
      this.activeEditor = undefined;
    }
  }

  /**
   * Dispose of the decoration types and clear previews
   */
  public dispose(): void {
    this.clearPreview();
    this.normalDecorationType.dispose();
    this.deleteDecorationType.dispose();
  }
}

/**
 * Parse user input for absolute line navigation and return the target line number
 * @param input The user input string
 * @param totalLines Total number of lines in the document
 * @returns The target line number (1-based) or null if invalid
 */
export function parseAbsoluteLineInput(input: string, totalLines: number): number | null {
  if (!input.trim()) {
    return null;
  }

  const lineNumber = parseInt(input.trim());
  if (isNaN(lineNumber) || lineNumber < 1 || lineNumber > totalLines) {
    return null;
  }

  return lineNumber;
}

/**
 * Parse user input for relative line navigation and return the offset
 * @param input The user input string
 * @param args Command arguments containing up/down characters
 * @returns The relative offset or null if invalid
 */
export function parseRelativeLineInput(input: string, args?: any): number | null {
  if (!input.trim()) {
    return null;
  }

  const trimmedValue = input.trim();
  let offset: number;

  // Get configured characters (with defaults)
  const upChar = args?.upCharacter || 'k';
  const downChar = args?.downCharacter || 'j';

  // Handle single character inputs (return null for incomplete input)
  if (trimmedValue === '+' || trimmedValue === '-' || trimmedValue === upChar || trimmedValue === downChar) {
    return null;
  }

  // Handle various prefixes
  if (trimmedValue.startsWith('+')) {
    const numStr = trimmedValue.substring(1);
    offset = parseInt(numStr);
  } else if (trimmedValue.startsWith('-')) {
    const numStr = trimmedValue.substring(1);
    offset = parseInt(numStr);
    if (!isNaN(offset)) {
      offset = -offset; // make it negative
    }
  } else if (trimmedValue.startsWith(upChar)) {
    const numStr = trimmedValue.substring(upChar.length);
    const num = parseInt(numStr);
    offset = isNaN(num) ? NaN : -num; // negative for up
  } else if (trimmedValue.startsWith(downChar)) {
    const numStr = trimmedValue.substring(downChar.length);
    const num = parseInt(numStr);
    offset = isNaN(num) ? NaN : num; // positive for down
  } else {
    // Plain number defaults to positive (down)
    offset = parseInt(trimmedValue);
  }

  if (isNaN(offset)) {
    return null;
  }

  return offset;
}
