// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { convertPredefinedVariables } from "../helpers/predefinedVariables";

export async function openFile(args: {
  filePath: string;
  line: number | string;
  column: number | string;
  // Open the file even if it is the same file
  alwaysOpen: boolean | undefined;
  // Match the current viewport range (useful for opening the same file from readonly or git-diff etc)
  matchRange: boolean | undefined;
  // Close the tab after switch
  closePreviousEditor: boolean | undefined;
}) {
  try {
    let targetFilePath = convertPredefinedVariables(args.filePath);
    const line = convertAndValidatePosition(args.line, "line");
    const column = convertAndValidatePosition(args.column, "column");
    const alwaysOpen = args.alwaysOpen;
    const matchRange = args.matchRange;
    const closePreviousEditor = args.closePreviousEditor;

    console.log(
      targetFilePath,
      `line: ${line}, column: ${column}, alwaysOpen: ${alwaysOpen}, matchRange: ${matchRange}, closePreviousEditor: ${closePreviousEditor}`
    );

    const sourceTextEditor = vscode.window.activeTextEditor;
    if (sourceTextEditor && (sourceTextEditor.document.fileName !== targetFilePath || alwaysOpen)) {
      // Close the active editor
      if (closePreviousEditor) {
        vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      }

      // Switch to the new document
      vscode.workspace.openTextDocument(vscode.Uri.file(targetFilePath)).then((doc) => {
        vscode.window.showTextDocument(doc).then((targetEditor) => {
          if (matchRange) {
            const currentRange = sourceTextEditor.visibleRanges[0];
            const currentSelection = [...sourceTextEditor.selections];
            revealPositionRange(targetEditor, currentRange, currentSelection);
          } else {
            revealPositionLineColumn(targetEditor, line, column);
          }
        });
      });
    }
  } catch (error: any) {
    console.error(`error:`, error);
    vscode.window.showErrorMessage(error.message);
  }
}

// Function overload signatures
function revealPositionLineColumn(editor: vscode.TextEditor, line: number, column: number): void {
  if (!line) return;
  const col = typeof column === "number" ? column : 1;
  const position = new vscode.Position(line - 1, col - 1);
  editor.selections = [new vscode.Selection(position, position)];
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.Default);
}

function revealPositionRange(
  editor: vscode.TextEditor,
  range: vscode.Range,
  currentSelection: vscode.Selection[]
): void {
  // Handle range case
  if (!range) return;
  // Set the cursor at the correct place.
  editor.selections = currentSelection ? currentSelection : [new vscode.Selection(range.start, range.start)];
  // We want to reveal the exact same center when we open the file
  const middleLineOfRange = Math.floor((range.start.line + range.end.line) / 2);
  editor.revealRange(
    new vscode.Range(middleLineOfRange, 0, middleLineOfRange, 0),
    vscode.TextEditorRevealType.InCenter
  );
}

function convertAndValidatePosition(value: number | string, positionType: string): number {
  if (typeof value === "string") {
    try {
      const convertedValue = convertPredefinedVariables(value);
      const numericValue = parseInt(convertedValue, 10);
      if (isNaN(numericValue)) {
        throw new Error(`Invalid ${positionType} number: ${convertedValue}`);
      }
      return numericValue;
    } catch (error) {
      throw new Error(`${positionType} conversion error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  return value;
}
