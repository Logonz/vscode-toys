// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { createOutputChannel } from "../extension";

const ConfigSpace = "vstoys.copy-highlight";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
let printCopyHighlightOutput: (content: string, reveal?: boolean) => void;

export function activateCopyHighlight(name: string, context: vscode.ExtensionContext) {
  console.log(`Activating ${name}`);
  printCopyHighlightOutput = createOutputChannel(`${name}`);
  printCopyHighlightOutput(`${name} activating`);

  let config = vscode.workspace.getConfiguration(`${ConfigSpace}`);

  // Retrieve settings with automatic fallback to defaults defined in package.json
  let foregroundColor: string | undefined = config.get("foregroundColor");
  let backgroundColor: string | undefined = config.get("backgroundColor");
  let timeout: number | undefined = config.get("timeout");

  context.subscriptions.push(
    vscode.commands.registerCommand("vstoys.copy-highlight.copy", async () => {
      // Copy to clipboard
      await vscode.commands.executeCommand("editor.action.clipboardCopyAction");

      console.log("Copy command executed");
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return; // No open text editor
      }

      // Apply decoration
      const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: backgroundColor
          ? pickColorType(backgroundColor)
          : pickColorType("editor.wordHighlightBackground"),
        color: foregroundColor || undefined,
      });

      // Apply decoration
      editor.setDecorations(decorationType, getSelections(editor));

      // Remove decoration after specified timeout
      setTimeout(() => {
        decorationType.dispose();
      }, timeout);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(`${ConfigSpace}.foregroundColor`) ||
        event.affectsConfiguration(`${ConfigSpace}.backgroundColor`) ||
        event.affectsConfiguration(`${ConfigSpace}.timeout`)
      ) {
        printCopyHighlightOutput("Configuration changed");
        config = vscode.workspace.getConfiguration(`${ConfigSpace}`);
        foregroundColor = config.get("foregroundColor");
        backgroundColor = config.get("backgroundColor");
        timeout = config.get("timeout");
      }
    })
  );

  printCopyHighlightOutput(`${name} activated`, false);
}

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

function getSelections(editor: vscode.TextEditor): readonly vscode.Selection[] | vscode.Range[] {
  let lastSelectionLine = -1;

  // We need to sort the selections for the case where an additional cursor is inserted
  // before the 'active' cursor of another selection on the same line.
  const sortedSelections = [...editor.selections].sort((a, b) => {
    if (a.active.line === b.active.line) {
      return a.active.character - b.active.character;
    }
    return a.active.line - b.active.line;
  });

  const expandedSelections = sortedSelections.map((selection) => {
    // With multiple cursors on a single line, any empty selection is ignored (after the first selection)
    if (selection.isEmpty && lastSelectionLine === selection.active.line) {
      // We don't worry about setting lastSelectionLine here as this branch is only for the matching line
      return null;
    }

    lastSelectionLine = selection.active.line;

    // Return the range of the line if the selection is empty (default copy behaviour)
    if (selection.isEmpty) {
      return editor.document.lineAt(selection.active).range;
    }

    // For non-empty selections, return the selection
    return selection;
  });

  return expandedSelections.filter((selection) => selection !== null) as vscode.Range[];
}
