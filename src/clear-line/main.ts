// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { createOutputChannel } from "../extension";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
let printClearLineOutput: (content: string, reveal?: boolean) => void;

export function activateClearLine(name: string, context: vscode.ExtensionContext) {
  console.log(`Activating ${name}`);
  printClearLineOutput = createOutputChannel(`${name}`);
  printClearLineOutput(`${name} activating`);

  context.subscriptions.push(
    vscode.commands.registerCommand("vstoys.clear-line.clearLines", async () => {
      // Get all selections
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return; // No open text editor
      }

      const selections = getSelections(editor);

      // Get all rows from the selections
      const rows = selections.map((selection) => selection.start.line);

      // Clear the lines except the whitespace at the start
      editor.edit((editBuilder) => {
        rows.forEach((row) => {
          const line = editor.document.lineAt(row);
          const start = line.firstNonWhitespaceCharacterIndex;
          const end = line.range.end.character;
          const range = new vscode.Range(row, start, row, end);
          if (start === end) {
            vscode.commands.executeCommand("editor.action.deleteLines");
          } else {
            editBuilder.replace(range, "".repeat(end - start));
          }
        });
      });
    })
  );

  printClearLineOutput(`${name} activated`, false);
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
