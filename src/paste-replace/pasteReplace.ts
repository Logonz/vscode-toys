import * as vscode from "vscode";

/**
 * Detect the line ending format used in the document
 * @param document The VSCode text document
 * @returns The line ending string (either '\r\n' or '\n')
 */
function detectLineEnding(document: vscode.TextDocument): string {
  // Check VSCode's built-in line ending detection
  if (document.eol === vscode.EndOfLine.CRLF) {
    return "\r\n";
  } else {
    return "\n";
  }
}

/**
 * Process multi-line clipboard content with relative indentation preservation
 * @param clipboardLines Array of lines from clipboard
 * @param targetIndentation Target indentation to anchor to
 * @returns Array of processed lines with adjusted indentation
 */
function processMultiLineContent(clipboardLines: string[], targetIndentation: string): string[] {
  // Filter out empty lines at the end
  while (clipboardLines.length > 0 && clipboardLines[clipboardLines.length - 1].trim() === "") {
    clipboardLines.pop();
  }

  if (clipboardLines.length === 0) {
    return [""];
  }

  // Find the minimum indentation level (base level to anchor from)
  let minIndentation = Infinity;
  const lineIndentations: string[] = [];

  for (const line of clipboardLines) {
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";
    lineIndentations.push(indent);

    // Only consider non-empty lines for minimum indentation
    if (line.trim().length > 0) {
      minIndentation = Math.min(minIndentation, indent.length);
    }
  }

  // If all lines were empty, set minIndentation to 0
  if (minIndentation === Infinity) {
    minIndentation = 0;
  }

  // Process each line: remove base indentation and apply target indentation
  const processedLines: string[] = [];

  for (let i = 0; i < clipboardLines.length; i++) {
    const line = clipboardLines[i];
    const lineIndent = lineIndentations[i];

    if (line.trim().length === 0) {
      // Empty lines remain empty
      processedLines.push("");
    } else {
      // Calculate relative indentation from the base level
      const relativeIndent = lineIndent.substring(minIndentation);
      const content = line.substring(lineIndent.length);

      // Combine target indentation + relative indentation + content
      const newLine = targetIndentation + relativeIndent + content;
      processedLines.push(newLine);
    }
  }

  return processedLines;
}

/**
 * Paste Replace: Normal paste behavior with smart indentation
 * - Replaces selections like normal paste
 * - For cursors, replaces entire line
 * - Applies indentation logic to the first line of clipboard content
 * - Preserves relative indentation for multi-line content
 */
export async function pasteReplace(printOutput: (content: string) => void): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor");
    return;
  }

  try {
    // Get clipboard content
    const clipboardText = await vscode.env.clipboard.readText();
    if (!clipboardText) {
      vscode.window.showInformationMessage("Clipboard is empty");
      return;
    }

    const lineEnding = detectLineEnding(editor.document);
    const clipboardLines = clipboardText.split(/\r?\n/);

    // Separate selections from cursors, and sort selections in reverse order (bottom to top)
    // This prevents line number shifts from affecting subsequent operations
    let selections = editor.selections.filter((selection) => !selection.isEmpty);

    // Sort selections by start position in reverse order
    selections.sort((a, b) => b.start.compareTo(a.start));

    printOutput("Running pasteReplace");
    printOutput(`selections: ${selections.length}`);

    // // If the cursors have selection
    // if (selections.length > 0) {
    //   printOutput("Running deleteRight");
    //   // First delete the selected text to create empty/whitespace-only lines
    //   await vscode.commands.executeCommand("deleteRight");
    // }
    const cursors = editor.selections.filter((selection) => selection.isEmpty);
    printOutput(`cursors: ${cursors.length}`);

    // Store original selections for restoration later
    const originalSelections = selections.map((selection) => ({
      start: selection.start,
      end: selection.end,
    }));

    await editor.edit((editBuilder) => {
      // Handle cursor positions (no selection) - keep original logic
      if (cursors.length > 0) {
        // Collect all cursor positions and sort them in reverse order (bottom to top)
        const cursorLines = cursors.map((selection) => selection.active.line).sort((a, b) => b - a);

        // Remove duplicates (in case multiple cursors are on the same line)
        const uniqueCursorLines = [...new Set(cursorLines)];

        // Process each cursor position
        for (const currentLine of uniqueCursorLines) {
          const lineText = editor.document.lineAt(currentLine);

          // Extract leading whitespace (indentation) for this line
          const leadingWhitespace = lineText.text.match(/^\s*/)?.[0] || "";

          // Process multi-line clipboard content with relative indentation for this cursor
          const processedLines = processMultiLineContent(clipboardLines, leadingWhitespace);

          const fullLineRange = lineText.range;

          if (processedLines.length === 1) {
            // Single line: simple replacement
            editBuilder.replace(fullLineRange, processedLines[0]);
          } else {
            // Multi-line: replace first line, then insert additional lines
            editBuilder.replace(fullLineRange, processedLines[0]);

            // Insert additional lines after the current line using document's line ending
            const endOfCurrentLine = fullLineRange.end;
            const additionalLines = lineEnding + processedLines.slice(1).join(lineEnding);
            editBuilder.insert(endOfCurrentLine, additionalLines);
          }
        }
      } else if (selections.length > 0) {
        const newSelections: vscode.Selection[] = [];
        // Handle actual text selections first
        for (const selection of selections) {
          // Extend the selection to the whole first line but keep the selection location for the last line
          const startLine = editor.document.lineAt(selection.start.line);
          const newSelection = new vscode.Selection(startLine.range.start, selection.end);
          // Change current selection to include the full line for each selection
          newSelections.push(newSelection);
        }
        editor.selections = newSelections;

        // Recalculate selections after editing
        selections = editor.selections.filter((selection) => !selection.isEmpty);

        // Sort selections by start position in reverse order
        selections.sort((a, b) => b.start.compareTo(a.start));

        // Process each cursor position
        for (const selection of selections) {
          const lineText = editor.document.lineAt(selection.active.line);

          // Extract leading whitespace (indentation) for this line
          const leadingWhitespace = lineText.text.match(/^\s*/)?.[0] || "";

          // Process multi-line clipboard content with relative indentation for this cursor
          const processedLines = processMultiLineContent(clipboardLines, leadingWhitespace);

          if (processedLines.length === 1) {
            // Single line: simple replacement
            editBuilder.replace(selection, processedLines[0]);
          } else {
            // Multi-line: replace first line, then insert additional lines
            editBuilder.replace(selection, processedLines[0]);

            // Insert additional lines after the current line using document's line ending
            const endOfCurrentLine = selection.end;
            const additionalLines = lineEnding + processedLines.slice(1).join(lineEnding);
            editBuilder.insert(endOfCurrentLine, additionalLines);
          }
        }
      }
    });

    // Log what was done
    if (selections.length > 0) {
      printOutput(`Replaced ${selections.length} selection(s) with clipboard content`);
    }
    if (cursors.length > 0) {
      const uniqueCursorLines = [...new Set(cursors.map((s) => s.active.line))];
      const lineNumbers = uniqueCursorLines
        .sort((a, b) => a - b)
        .map((line) => line + 1)
        .join(", ");
      printOutput(`Replaced ${uniqueCursorLines.length} line(s) [${lineNumbers}] with clipboard content`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Paste replace failed: ${error}`);
    printOutput(`Error: ${error}`);
  }
}
