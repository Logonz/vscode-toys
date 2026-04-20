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
  // Close editor in all other groups
  closeEditorInOtherGroups: boolean | undefined;
}) {
  try {
    let targetFilePath = convertPredefinedVariables(args.filePath);

    const line = convertAndValidatePosition(args.line, "line");
    const column = convertAndValidatePosition(args.column, "column");
    const alwaysOpen = args.alwaysOpen;
    const matchRange = args.matchRange;
    const closePreviousEditor = args.closePreviousEditor;

    console.log("[openFile]: resolved openFile options", {
      targetFilePath,
      line,
      column,
      alwaysOpen,
      matchRange,
      closePreviousEditor,
      closeEditorInOtherGroups: args.closeEditorInOtherGroups,
    });

    const sourceTextEditor = vscode.window.activeTextEditor;
    const activeTabGroup = vscode.window.tabGroups.activeTabGroup;

    if (sourceTextEditor && (sourceTextEditor.document.fileName !== targetFilePath || alwaysOpen)) {
      // Save the current view column so that we can open the new document in the same column
      const viewColumn = resolveTargetViewColumn(sourceTextEditor, targetFilePath);
      console.log("[openFile]: captured target view column", {
        sourceEditorViewColumn: sourceTextEditor.viewColumn,
        activeTabGroupViewColumn: activeTabGroup?.viewColumn,
        chosenViewColumn: viewColumn,
      });

      // Close the active editor
      if (closePreviousEditor) {
        console.log("[openFile]: closing previous active editor before opening target file");
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      }

      // Close the same file in other group before opening
      if (args.closeEditorInOtherGroups) {
        for (const group of vscode.window.tabGroups.all) {
          // Skip the current group
          if (group.viewColumn !== viewColumn) {
            // Check each tab in the group
            for (const tab of group.tabs) {
              if (tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === targetFilePath) {
                console.log("[openFile]: closing matching tab in other group", {
                  groupViewColumn: group.viewColumn,
                  targetFilePath,
                  tabLabel: tab.label,
                });
                await vscode.window.tabGroups.close(tab, true);
              }
            }
          }
        }
      }

      // Switch to the new document
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(targetFilePath));

      // Not not make the tab preview(italics tab) and open in the same view column
      const targetEditor = await vscode.window.showTextDocument(doc, { preview: false, viewColumn: viewColumn });
      console.log("[openFile]: target document shown in editor", {
        openedFileName: targetEditor.document.fileName,
        targetViewColumn: targetEditor.viewColumn,
        requestedViewColumn: viewColumn,
        preview: false,
        matchRange,
      });

      if (matchRange) {
        const currentRange = sourceTextEditor.visibleRanges[0];
        const currentSelection = [...sourceTextEditor.selections];
        revealPositionRange(targetEditor, currentRange, currentSelection);
      } else {
        revealPositionLineColumn(targetEditor, line, column);
      }
    } else {
      console.log("[openFile]: skipping openFile operation", {
        hasSourceEditor: !!sourceTextEditor,
        sameFile: sourceTextEditor?.document.fileName === targetFilePath,
        alwaysOpen,
      });
    }
  } catch (error: any) {
    console.log("[openFile]: openFile() failed", {
      message: error?.message,
      stack: error?.stack,
    });
    console.error(`error:`, error);
    vscode.window.showErrorMessage(error.message);
  }
}

/**
 * Decide which editor group the target document should open into.
 *
 * Why this helper exists:
 * - `openFile()` is often called from unusual VS Code surfaces, not just a normal text editor.
 * - In those cases the usual signals can be missing or misleading:
 *   - `activeTextEditor.viewColumn` can be `undefined`
 *   - the active tab can be a diff/custom/readonly/editor-like surface
 *   - the file may already be open in another group, and we still want a sensible destination
 * - Historically this caused intermittent behavior where we closed one editor, logged that we
 *   opened the target, but the document either appeared in the wrong group or appeared to not
 *   open at all.
 *
 * Strategy:
 * We prefer the strongest signal first, then progressively weaker fallbacks.
 * The guiding principle is:
 * - opening in a slightly unexpected group is better UX than failing to visibly open the file.
 *
 * Current priority order:
 * 1. `activeTabGroup.viewColumn`
 *    Best signal for “where the user is working now”, especially when the active surface is not a
 *    plain `TextEditor` (diff editors are the main example).
 * 2. `sourceTextEditor.viewColumn`
 *    Good traditional fallback for the normal text-editor case.
 * 3. A group that already has the target file open as a regular text tab
 *    Useful when the other signals are missing, unstable, or stale.
 * 4. `vscode.ViewColumn.Active`
 *    Final safety net. If everything else is unavailable, still ask VS Code to open the file in
 *    the currently active area rather than giving up.
 *
 * Important note:
 * This helper only decides the destination group. It does not perform any open/close action.
 * The surrounding `openFile()` flow still controls sequencing and awaits the close/open steps to
 * avoid race conditions.
 */
function resolveTargetViewColumn(
  sourceTextEditor: vscode.TextEditor | undefined,
  targetFilePath: string
): vscode.ViewColumn {
  // Best “what group is active right now?” signal. This is intentionally preferred over
  // `sourceTextEditor.viewColumn` because special editor surfaces can leave the text editor state
  // incomplete while the tab group still correctly reflects the focused group.
  const activeTabGroupViewColumn = vscode.window.tabGroups.activeTabGroup?.viewColumn;

  // Traditional signal from a regular text editor. Still valuable, but not always reliable in
  // non-standard editor situations.
  const sourceEditorViewColumn = sourceTextEditor?.viewColumn;

  // As a defensive fallback, look for any group that already contains this exact target file as a
  // normal text tab. We only consider `TabInputText` here on purpose:
  // - diff tabs and custom tabs can represent the same path in non-standard ways
  // - if we treated every tab type as equivalent, we could incorrectly anchor to an unrelated UI
  //   surface instead of a normal editor group
  //
  // We collect all matches, but only use the first valid one as a fallback candidate because the
  // earlier signals are generally more representative of current user intent.
  const matchingOpenTextTabColumns = vscode.window.tabGroups.all
    .filter((group) =>
      group.tabs.some((tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === targetFilePath)
    )
    .map((group) => group.viewColumn)
    .filter((viewColumn): viewColumn is vscode.ViewColumn => isValidViewColumn(viewColumn));

  // Ordered list of candidates from strongest to weakest. The first valid column wins.
  // Keeping this as explicit data rather than nested `if`s makes debugging much easier because we
  // can log the full decision space whenever a strange VS Code state shows up.
  const candidateColumns = [
    { name: "activeTabGroup.viewColumn", value: activeTabGroupViewColumn },
    { name: "sourceTextEditor.viewColumn", value: sourceEditorViewColumn },
    { name: "matchingOpenTextTabColumns[0]", value: matchingOpenTextTabColumns[0] },
  ];

  // Select the first usable candidate according to the priority above.
  const bestCandidate = candidateColumns.find((candidate): candidate is { name: string; value: vscode.ViewColumn } =>
    isValidViewColumn(candidate.value)
  );

  // If we found a valid explicit column, use it.
  if (bestCandidate) {
    console.log("[openFile]: resolveTargetViewColumn() selected candidate", bestCandidate);
    return bestCandidate.value;
  }

  // Last-resort fallback. Even if every signal above is unavailable, telling VS Code “open in the
  // active column” is still better than having the operation appear to do nothing.
  console.log("[openFile]: resolveTargetViewColumn() falling back to ViewColumn.Active");
  return vscode.ViewColumn.Active;
}

/**
 * Guard used when reading VS Code view-column values.
 *
 * We intentionally treat only numeric values as valid columns because some editor states can leave
 * the property unset. Narrowing here keeps the selection logic explicit and type-safe.
 */
function isValidViewColumn(value: vscode.ViewColumn | undefined): value is vscode.ViewColumn {
  return typeof value === "number";
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
      console.log("[openFile]: convertAndValidatePosition() failed", {
        positionType,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error(`${positionType} conversion error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  return value;
}
