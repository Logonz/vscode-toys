// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { createOutputChannel, deactivate } from "../extension";

interface GotoLineQuickPickItem extends vscode.QuickPickItem {
  lineNumber?: number;
}

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

      // Create quick pick items for each line
      const items: GotoLineQuickPickItem[] = [];

      // Add current line indicator
      items.push({
        label: `$(arrow-right) ${currentLine}: ${document.lineAt(currentLine - 1).text.trim() || "(empty line)"}`,
        description: `Current line`,
        lineNumber: currentLine,
      });

      // Add separator
      items.push({
        label: "",
        kind: vscode.QuickPickItemKind.Separator,
      });

      // Add lines with content preview
      for (let i = 1; i <= totalLines; i++) {
        const lineText = document.lineAt(i - 1).text.trim();
        const isCurrent = i === currentLine;

        items.push({
          label: `${isCurrent ? "$(arrow-right) " : ""}${i}: ${lineText || "(empty line)"}`,
          description: isCurrent ? "Current" : "",
          lineNumber: i,
        });
      }

      // Show quick pick
      const quickPick = vscode.window.createQuickPick();
      quickPick.items = items;
      quickPick.placeholder = `Go to line (1-${totalLines})`;
      quickPick.title = "Go to Line";
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;

      // Handle selection
      // quickPick.onDidChangeSelection(async (selection) => {
      //   printGotoLineOutput("onDidChangeSelection");
      //   try {
      //     vscode.commands.executeCommand("vstoys.dot-repeat.repeatExit", { deactivateAll: true });
      //   } catch (error) {
      //     console.error("Error executing dot-repeat command:", error);
      //   }

      //   if (selection[0]) {
      //     const selectedItem = selection[0] as GotoLineQuickPickItem;
      //     if (selectedItem.lineNumber) {
      //       navigateToLine(editor, selectedItem.lineNumber, args);
      //     }
      //   }
      // });

      // Handle acceptance (Enter key)
      quickPick.onDidAccept(() => {
        printGotoLineOutput("onDidAccept");
        try {
          vscode.commands.executeCommand("vstoys.dot-repeat.repeatExit", { deactivateAll: true });
        } catch (error) {
          console.error("Error executing dot-repeat command:", error);
        }

        // If user typed a number directly, navigate to that line
        const inputValue = quickPick.value;
        const lineNumber = parseInt(inputValue);

        if (!isNaN(lineNumber) && lineNumber >= 1 && lineNumber <= totalLines) {
          navigateToLine(editor, lineNumber, args);
        } else if (quickPick.selectedItems.length > 0) {
          // If a line was selected from the list, navigate to it using the stored lineNumber
          const selectedItem = quickPick.selectedItems[0] as GotoLineQuickPickItem;
          if (selectedItem.lineNumber) {
            navigateToLine(editor, selectedItem.lineNumber, args);
          }
        }

        quickPick.hide();
      });

      // Handle manual input
      quickPick.onDidChangeValue((value) => {
        printGotoLineOutput("onDidChangeValue");
        try {
          vscode.commands.executeCommand("vstoys.dot-repeat.repeatExit", { deactivateAll: true });
        } catch (error) {
          console.error("Error executing dot-repeat command:", error);
        }
        const lineNumber = parseInt(value);
        if (!isNaN(lineNumber) && lineNumber >= 1 && lineNumber <= totalLines) {
          // Filter items to show matching line using the stored lineNumber
          const filteredItems = items.filter(
            (item) => item.lineNumber === lineNumber || item.kind === vscode.QuickPickItemKind.Separator
          );
          quickPick.items = filteredItems.length > 1 ? filteredItems : items;
        } else if (value === "") {
          // Show all items when input is cleared
          quickPick.items = items;
        }
      });

      quickPick.show();
    })
  );

  printGotoLineOutput(`${name} activated`, false);
}
