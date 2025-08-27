import * as vscode from "vscode";

/**
 * Navigate to a line relative to the current position
 * @param editor The text editor to navigate in
 * @param relativeOffset The relative offset (positive for down, negative for up)
 * @param args Optional arguments to pass to commands after navigation
 * @param printOutput Function to print output messages
 */
export function navigateToRelativeLine(
  editor: vscode.TextEditor,
  relativeOffset: number,
  args?: any,
  printOutput?: (content: string) => void
): void {
  const currentPosition = editor.selection.active;
  const currentLineNumber = currentPosition.line; // 0-based
  const targetLineNumber = currentLineNumber + relativeOffset;
  const totalLines = editor.document.lineCount;

  // Validate target line is within bounds
  if (targetLineNumber < 0 || targetLineNumber >= totalLines) {
    const displayCurrentLine = currentLineNumber + 1;
    const displayTargetLine = targetLineNumber + 1;
    vscode.window.showErrorMessage(
      `Cannot navigate to line ${displayTargetLine}. Valid range is 1-${totalLines} (current: ${displayCurrentLine})`
    );
    return;
  }

  // Convert to 1-based line number for the existing navigateToLine function
  const targetLine1Based = targetLineNumber + 1;
  navigateToLine(editor, targetLine1Based, args, printOutput);
}

/**
 * Navigate to a specific line in the editor
 * @param editor The text editor to navigate in
 * @param lineOrPosition Either a 1-based line number or a vscode.Position
 * @param args Optional arguments to pass to commands after navigation
 * @param printOutput Function to print output messages
 */
export function navigateToLine(
  editor: vscode.TextEditor,
  lineOrPosition: number | vscode.Position,
  args?: any,
  printOutput?: (content: string) => void
): void {
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
    const currentLineNumber = currentPosition.line;
    const targetLineNumber = position.line;

    let selectionEndPosition: vscode.Position;

    if (targetLineNumber > currentLineNumber) {
      // Selecting downward - select to end of target line (inclusive)
      const targetLineText = editor.document.lineAt(targetLineNumber);
      selectionEndPosition = new vscode.Position(targetLineNumber, targetLineText.text.length);
    } else {
      // Selecting upward - select to beginning of target line
      selectionEndPosition = new vscode.Position(targetLineNumber, 0);
    }

    newSelection = new vscode.Selection(currentPosition, selectionEndPosition);

    // Move cursor to create the selection
    editor.selection = newSelection;
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);

    if (args?.delete === true) {
      // Delete the selected text
      editor
        .edit((editBuilder) => {
          editBuilder.delete(newSelection);
        })
        .then((applied) => {
          const direction = targetLineNumber > currentLineNumber ? "down" : "up";
          if (applied) {
            printOutput?.(
              `Selected and deleted from line ${
                currentPosition.line + 1
              } to line ${displayLineNumber} (${direction}ward)`
            );
            // ! Reindent the lines during delete. (Do we need a setting here?)
            // Reindent after delete completes
            vscode.commands.executeCommand("editor.action.reindentselectedlines");
          } else {
            printOutput?.("Delete operation did not apply; skipped reindent");
          }
        });
    } else {
      const direction = targetLineNumber > currentLineNumber ? "down" : "up";
      printOutput?.(`Selected from line ${currentPosition.line + 1} to line ${displayLineNumber} (${direction}ward)`);
    }
  } else {
    // Just move cursor to the target line
    newSelection = new vscode.Selection(position, position);
    // Move cursor to the line (or create selection)
    editor.selection = newSelection;
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    printOutput?.(`Navigated to line ${displayLineNumber}`);
  }

  // Execute command after goto if specified
  if (args?.["executeCommandAfterGoto"]) {
    console.log(args["executeCommandAfterGoto"]);
    vscode.commands.executeCommand(args["executeCommandAfterGoto"]);
  }
}
