// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { createOutputChannel, deactivate } from "../extension";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
let printGotoLineOutput: (content: string, reveal?: boolean) => void;

/**
 * Navigate to a specific line in the editor
 * @param editor The text editor to navigate in
 * @param lineOrPosition Either a 1-based line number or a vscode.Position
 * @param args Optional arguments to pass to commands after navigation
 */
function navigateToLine(editor: vscode.TextEditor, lineOrPosition: number | vscode.Position, args?: any): void {
  let position: vscode.Position;
  let displayLineNumber: number;

  if (typeof lineOrPosition === "number") {
    // Convert 1-based line number to 0-based position
    position = new vscode.Position(lineOrPosition - 1, 0);
    displayLineNumber = lineOrPosition;
  } else {
    // Use the provided position
    position = lineOrPosition;
    displayLineNumber = position.line + 1;
  }

  let newSelection: vscode.Selection;

  if (args?.select === true) {
    // Create selection from current cursor position to target line
    const currentPosition = editor.selection.active;
    newSelection = new vscode.Selection(currentPosition, position);

    // Move cursor to create the selection
    editor.selection = newSelection;
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

    if (args?.delete === true) {
      // Delete the selected text
      editor.edit((editBuilder) => {
        editBuilder.delete(newSelection);
      });
      printGotoLineOutput(`Selected and deleted from line ${currentPosition.line + 1} to line ${displayLineNumber}`);
    } else {
      printGotoLineOutput(`Selected from line ${currentPosition.line + 1} to line ${displayLineNumber}`);
    }
  } else {
    // Just move cursor to the target line
    newSelection = new vscode.Selection(position, position);
    // Move cursor to the line (or create selection)
    editor.selection = newSelection;
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    printGotoLineOutput(`Navigated to line ${displayLineNumber}`);
  }

  // Execute command after goto if specified
  if (args?.["executeCommandAfterGoto"]) {
    console.log(args["executeCommandAfterGoto"]);
    vscode.commands.executeCommand(args["executeCommandAfterGoto"]);
  }
}

export function activateGotoLine(name: string, context: vscode.ExtensionContext) {
  console.log(`Activating ${name}`);
  printGotoLineOutput = createOutputChannel(`${name}`);
  printGotoLineOutput(`${name} activating`);

  context.subscriptions.push(
    vscode.commands.registerCommand("vstoys.goto-line.goto", async (args) => {
      console.log(args);
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active text editor");
        return;
      }

      const document = editor.document;
      const totalLines = document.lineCount;
      const currentLine = editor.selection.active.line + 1; // VS Code uses 0-based indexing

      // Show input box for line number
      const result = await vscode.window.showInputBox({
        prompt: `Go to line (1-${totalLines})`,
        placeHolder: `Enter line number (current: ${currentLine})`,
        value: currentLine.toString(),
        validateInput: (value: string) => {
          if (!value.trim()) {
            return "Please enter a line number";
          }
          
          const lineNumber = parseInt(value.trim());
          if (isNaN(lineNumber)) {
            return "Please enter a valid number";
          }
          
          if (lineNumber < 1 || lineNumber > totalLines) {
            return `Line number must be between 1 and ${totalLines}`;
          }
          
          return null; // No error
        }
      });

      // Handle the result
      if (result !== undefined) {
        try {
          vscode.commands.executeCommand("vstoys.dot-repeat.repeatExit", { deactivateAll: true });
        } catch (error) {
          console.error("Error executing dot-repeat command:", error);
        }

        const lineNumber = parseInt(result.trim());
        if (!isNaN(lineNumber) && lineNumber >= 1 && lineNumber <= totalLines) {
          navigateToLine(editor, lineNumber, args);
        }
      }
    })
  );

  printGotoLineOutput(`${name} activated`, false);
}
