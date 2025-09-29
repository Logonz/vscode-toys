import * as vscode from "vscode";
import { pickColorType } from "../../helpers/pickColorType";
import { BaseMatch, LabeledMatch } from "./types";

export class JumpDecorationManager {
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

    const borderWidth = 1;
    const leftShift = 0;
    // Jump label decoration
    this.jumpLabelDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        backgroundColor: pickColorType(jumpLabelBackgroundColor),
        color: pickColorType(jumpLabelForegroundColor),
        textDecoration: "none;position:absolute;z-index:999999;",
        margin: `-${borderWidth}px 0 0 ${leftShift + (4 - borderWidth)}px`, // (Manually adjusted for the border, so 0 0 0 4px is the real value.
        border: primaryBorderColor == "" ? undefined : "1px dotted",
        borderColor: primaryBorderColor ? pickColorType(primaryBorderColor) : undefined,
      },
    });
  }

  /**
   * Apply decorations to editor
   */
  applyDecorations<T extends BaseMatch>(
    editor: vscode.TextEditor,
    labeledMatches: LabeledMatch<T>[],
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
          // TODO: We could add a no-break here to make it look nicer (needs a bit of modification)
          // contentText: match.jumpChar + "\u00A0",
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
