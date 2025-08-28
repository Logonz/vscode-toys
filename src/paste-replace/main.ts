import * as vscode from "vscode";
import { createOutputChannel } from "../extension";

let printPasteReplaceOutput: (content: string, reveal?: boolean) => void;

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

export function activatePasteReplace(name: string, context: vscode.ExtensionContext) {
  console.log(`Activating ${name}`);
  printPasteReplaceOutput = createOutputChannel(`${name}`);
  printPasteReplaceOutput(`${name} activating`);

  const smartPaste = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor");
      return;
    }

    // Get configuration setting for reindent behavior
    const config = vscode.workspace.getConfiguration("vstoys.paste-replace");
    const shouldReindent = config.get<boolean>("reindentBeforePaste", true);

    // Check if we have actual text selections (not just cursors)
    const hasSelections = editor.selections.some((selection) => !selection.isEmpty);

    if (hasSelections) {
      printPasteReplaceOutput("Using custom replace for selected text");

      // First delete the selected text to create empty/whitespace-only lines
      await vscode.commands.executeCommand("deleteRight");

      // Reindent the now empty/whitespace lines if enabled
      if (shouldReindent) {
        await vscode.commands.executeCommand("editor.action.reindentselectedlines");
      }

      // Use our custom replace functionality for the now empty lines
      await replaceLineWithClipboard();
      return;
    }

    // Check if any cursor is on a line with only whitespace
    const shouldUseReplaceMode = editor.selections.some((selection) => {
      const currentLine = selection.active.line;
      const lineText = editor.document.lineAt(currentLine);
      // Check if line contains only whitespace (spaces, tabs, etc.)
      return lineText.text.trim() === "";
    });

    if (shouldUseReplaceMode) {
      printPasteReplaceOutput("Using custom replace for whitespace-only lines");

      // Reindent the whitespace-only lines before pasting if enabled
      if (shouldReindent) {
        await vscode.commands.executeCommand("editor.action.reindentselectedlines");
      }

      // Use our custom replace functionality for whitespace-only lines
      await replaceLineWithClipboard();
    } else {
      printPasteReplaceOutput("Using standard paste for non-empty lines");
      // Use VSCode's default paste action for lines with content
      await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
    }
  };

  const replaceLineWithClipboard = async () => {
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
      const selections = editor.selections.filter((selection) => !selection.isEmpty);
      const cursors = editor.selections.filter((selection) => selection.isEmpty);

      // Sort selections by start position in reverse order
      selections.sort((a, b) => b.start.compareTo(a.start));

      await editor.edit((editBuilder) => {
        // Handle actual text selections first
        for (const selection of selections) {
          // For selections, determine indentation based on selection position
          const startLine = editor.document.lineAt(selection.start.line);

          // Check if selection starts at the beginning of the line (after whitespace only)
          const linePrefix = startLine.text.substring(0, selection.start.character);
          const isStartOfLine = linePrefix.trim() === "";

          let leadingWhitespace = "";
          if (isStartOfLine) {
            // Selection starts at beginning of line - use line's indentation
            leadingWhitespace = linePrefix;
          }
          // If not at start of line, don't add any indentation (leadingWhitespace stays "")

          // Process multi-line clipboard content with relative indentation
          const processedLines = processMultiLineContent(clipboardLines, leadingWhitespace);

          if (processedLines.length === 1) {
            // Single line: simple replacement of selection
            editBuilder.replace(selection, processedLines[0]);
          } else {
            // Multi-line: replace selection with first line, then insert additional lines
            editBuilder.replace(selection, processedLines[0]);

            // Insert additional lines after the selection using document's line ending
            const endOfSelection = selection.end;
            const additionalLines = lineEnding + processedLines.slice(1).join(lineEnding);
            editBuilder.insert(endOfSelection, additionalLines);
          }
        }

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
        }
      });

      // Log what was done
      if (selections.length > 0) {
        printPasteReplaceOutput(`Replaced ${selections.length} selection(s) with clipboard content`);
      }
      if (cursors.length > 0) {
        const uniqueCursorLines = [...new Set(cursors.map((s) => s.active.line))];
        const lineNumbers = uniqueCursorLines
          .sort((a, b) => a - b)
          .map((line) => line + 1)
          .join(", ");
        printPasteReplaceOutput(`Replaced ${uniqueCursorLines.length} line(s) [${lineNumbers}] with clipboard content`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Paste replace failed: ${error}`);
      printPasteReplaceOutput(`Error: ${error}`);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("vstoys.paste-replace.clipboardPasteReplace", replaceLineWithClipboard),
    vscode.commands.registerCommand("vstoys.paste-replace.clipboardPasteSmart", smartPaste)
  );

  vscode.commands.executeCommand("setContext", "vstoys.paste-replace.active", true);

  printPasteReplaceOutput(`${name} activated`, false);
}
