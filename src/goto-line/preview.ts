import * as vscode from "vscode";
import { GotoLineSettings } from "./settings";
import { pickColorType } from "../helpers/pickColorType";

/**
 * Manages preview decorations for goto-line operations
 */
export class GotoLinePreview {
  private normalDecorationType!: vscode.TextEditorDecorationType;
  private deleteDecorationType!: vscode.TextEditorDecorationType;
  private copyDecorationType!: vscode.TextEditorDecorationType;
  private cutDecorationType!: vscode.TextEditorDecorationType;
  private normalCharDecorationType!: vscode.TextEditorDecorationType;
  private deleteCharDecorationType!: vscode.TextEditorDecorationType;
  private copyCharDecorationType!: vscode.TextEditorDecorationType;
  private cutCharDecorationType!: vscode.TextEditorDecorationType;
  private activeEditor: vscode.TextEditor | undefined;
  private settings: GotoLineSettings;

  constructor(settings: GotoLineSettings) {
    this.settings = settings;
    this.createDecorationTypes();
  }

  /**
   * Create or recreate decoration types based on current settings
   */
  private createDecorationTypes(): void {
    // Dispose existing decorations if they exist
    this.disposeDecorationTypes();

    // Create decoration type for normal preview highlighting (whole lines)
    this.normalDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: pickColorType(this.settings.selectColor),
      isWholeLine: true,
      overviewRulerColor: pickColorType(this.settings.selectColor),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    // Create decoration type for delete preview highlighting (whole lines)
    this.deleteDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: pickColorType(this.settings.deleteColor),
      isWholeLine: true,
      overviewRulerColor: pickColorType(this.settings.deleteColor),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    // Create decoration type for copy preview highlighting (whole lines)
    this.copyDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: pickColorType(this.settings.copyColor),
      isWholeLine: true,
      overviewRulerColor: pickColorType(this.settings.copyColor),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    // Create decoration type for cut preview highlighting (whole lines)
    // Delete + copy create cut
    this.cutDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: pickColorType(this.settings.cutColor),
      isWholeLine: true,
      overviewRulerColor: pickColorType(this.settings.cutColor),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    // Create decoration type for normal preview highlighting (character-level)
    this.normalCharDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: pickColorType(this.settings.selectColor),
      overviewRulerColor: pickColorType(this.settings.selectColor),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    // Create decoration type for delete preview highlighting (character-level)
    this.deleteCharDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: pickColorType(this.settings.deleteColor),
      overviewRulerColor: pickColorType(this.settings.deleteColor),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    // Create decoration type for copy preview highlighting (character-level)
    this.copyCharDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: pickColorType(this.settings.copyColor),
      overviewRulerColor: pickColorType(this.settings.copyColor),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    // Create decoration type for cut preview highlighting (character-level)
    // Delete + copy create cut
    this.cutCharDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: pickColorType(this.settings.cutColor),
      overviewRulerColor: pickColorType(this.settings.cutColor),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
  }

  /**
   * Dispose existing decoration types
   */
  private disposeDecorationTypes(): void {
    if (this.normalDecorationType) {
      this.normalDecorationType.dispose();
    }
    if (this.deleteDecorationType) {
      this.deleteDecorationType.dispose();
    }
    if (this.copyDecorationType) {
      this.copyDecorationType.dispose();
    }
    if (this.cutDecorationType) {
      this.cutDecorationType.dispose();
    }
    if (this.normalCharDecorationType) {
      this.normalCharDecorationType.dispose();
    }
    if (this.deleteCharDecorationType) {
      this.deleteCharDecorationType.dispose();
    }
    if (this.copyCharDecorationType) {
      this.copyCharDecorationType.dispose();
    }
    if (this.cutCharDecorationType) {
      this.cutCharDecorationType.dispose();
    }
  }

  /**
   * Update settings and recreate decorations
   */
  public updateSettings(newSettings: GotoLineSettings): void {
    this.settings = newSettings;
    this.createDecorationTypes();
  }

  /**
   * Preview line selection for absolute line navigation
   * @param editor The text editor to preview in
   * @param targetLine The target line number (1-based)
   * @param args Command arguments that might include select/delete flags
   */
  public previewAbsoluteLineSelection(editor: vscode.TextEditor, targetLine: number, args?: any): void {
    // Check if highlighting is enabled
    if (!this.settings.highlightingEnabled) {
      return;
    }

    this.activeEditor = editor;

    if (!args?.select && !args?.delete && !args?.copy) {
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
  public previewRelativeLineSelection(editor: vscode.TextEditor, relativeOffset: number, args?: any): void {
    // Check if highlighting is enabled
    if (!this.settings.highlightingEnabled) {
      return;
    }

    this.activeEditor = editor;

    const currentLine = editor.selection.active.line + 1; // Convert to 1-based
    const targetLine = currentLine + relativeOffset;

    if (!args?.select) {
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
    let decorationType: vscode.TextEditorDecorationType;
    if (args?.delete && args?.copy) {
      decorationType = this.cutDecorationType;
    } else if (args?.delete) {
      decorationType = this.deleteDecorationType;
    } else if (args?.copy) {
      decorationType = this.copyDecorationType;
    } else {
      decorationType = this.normalDecorationType;
    }
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

    const currentPosition = editor.selection.active; // Get actual cursor position
    const currentLineNumber = currentPosition.line; // 0-based
    const targetLineNumber = toLine - 1; // Convert to 0-based

    const wholeLineDecorations: vscode.DecorationOptions[] = [];
    const charLevelDecorations: vscode.DecorationOptions[] = [];

    // Choose decoration types based on delete/copy flags
    let wholeLineDecorationType: vscode.TextEditorDecorationType;
    // Delete + copy create cut
    if (args?.delete && args?.copy) {
      wholeLineDecorationType = this.cutDecorationType;
    } else if (args?.delete) {
      wholeLineDecorationType = this.deleteDecorationType;
    } else if (args?.copy) {
      wholeLineDecorationType = this.copyDecorationType;
    } else {
      wholeLineDecorationType = this.normalDecorationType;
    }
    let charLevelDecorationType: vscode.TextEditorDecorationType;
    // Delete + copy create cut
    if (args?.delete && args?.copy) {
      charLevelDecorationType = this.cutCharDecorationType;
    } else if (args?.delete) {
      charLevelDecorationType = this.deleteCharDecorationType;
    } else if (args?.copy) {
      charLevelDecorationType = this.copyCharDecorationType;
    } else {
      charLevelDecorationType = this.normalCharDecorationType;
    }

    if (targetLineNumber > currentLineNumber) {
      // Downward selection: from cursor position to end of target line

      // 1. Current line: from cursor to end of line (character-level)
      const currentLineText = editor.document.lineAt(currentLineNumber);
      if (currentPosition.character < currentLineText.text.length) {
        charLevelDecorations.push({
          range: new vscode.Range(currentPosition, new vscode.Position(currentLineNumber, currentLineText.text.length)),
        });
      }

      // 2. Middle lines: entire lines (whole-line decorations)
      for (let lineNum = currentLineNumber + 1; lineNum < targetLineNumber; lineNum++) {
        wholeLineDecorations.push({
          range: new vscode.Range(lineNum, 0, lineNum, 0), // whole line range
        });
      }

      // 3. Target line: entire line (whole-line decoration)
      if (targetLineNumber > currentLineNumber) {
        wholeLineDecorations.push({
          range: new vscode.Range(targetLineNumber, 0, targetLineNumber, 0),
        });
      }
    } else if (targetLineNumber < currentLineNumber) {
      // Upward selection: from beginning of target line to cursor position

      // 1. Target line: entire line (whole-line decoration)
      wholeLineDecorations.push({
        range: new vscode.Range(targetLineNumber, 0, targetLineNumber, 0),
      });

      // 2. Middle lines: entire lines (whole-line decorations)
      for (let lineNum = targetLineNumber + 1; lineNum < currentLineNumber; lineNum++) {
        wholeLineDecorations.push({
          range: new vscode.Range(lineNum, 0, lineNum, 0),
        });
      }

      // 3. Current line: from beginning to cursor (character-level)
      if (currentPosition.character > 0) {
        charLevelDecorations.push({
          range: new vscode.Range(new vscode.Position(currentLineNumber, 0), currentPosition),
        });
      }
    } else {
      // Same line - just highlight the current line (whole-line)
      wholeLineDecorations.push({
        range: new vscode.Range(currentLineNumber, 0, currentLineNumber, 0),
      });
    }

    // Apply decorations efficiently
    editor.setDecorations(wholeLineDecorationType, wholeLineDecorations);
    editor.setDecorations(charLevelDecorationType, charLevelDecorations);
  }

  /**
   * Clear all preview decorations
   */
  public clearPreview(): void {
    if (this.activeEditor) {
      this.activeEditor.setDecorations(this.normalDecorationType, []);
      this.activeEditor.setDecorations(this.deleteDecorationType, []);
      this.activeEditor.setDecorations(this.copyDecorationType, []);
      this.activeEditor.setDecorations(this.cutDecorationType, []);
      this.activeEditor.setDecorations(this.normalCharDecorationType, []);
      this.activeEditor.setDecorations(this.deleteCharDecorationType, []);
      this.activeEditor.setDecorations(this.copyCharDecorationType, []);
      this.activeEditor.setDecorations(this.cutCharDecorationType, []);
      this.activeEditor = undefined;
    }
  }

  /**
   * Dispose of the decoration types and clear previews
   */
  public dispose(): void {
    this.clearPreview();
    this.disposeDecorationTypes();
  }
}
