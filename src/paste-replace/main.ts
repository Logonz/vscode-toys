import * as vscode from "vscode";
import { createOutputChannel } from "../extension";

let printPasteReplaceOutput: (content: string, reveal?: boolean) => void;

/**
 * Detect what indentation should be used for a line at the given position
 * by analyzing the surrounding context and using VSCode's formatting engine
 * @param editor The active text editor
 * @param position The position to check indentation for
 * @returns The indentation string that should be used
 */
async function detectSmartIndentation(editor: vscode.TextEditor, position: vscode.Position): Promise<string> {
  try {
    const document = editor.document;
    const lineNumber = position.line;

    // First, try to use VSCode's formatting engine if we have context
    if (lineNumber > 0) {
      // Look for the nearest non-empty line above to provide context
      let contextLineNumber = lineNumber - 1;
      while (contextLineNumber >= 0) {
        const line = document.lineAt(contextLineNumber);
        if (line.text.trim().length > 0) {
          // Found context line, try to format an empty line after it
          try {
            // Create a temporary range that includes the context line and target line
            const formatRange = new vscode.Range(
              contextLineNumber,
              0,
              lineNumber,
              document.lineAt(lineNumber).text.length
            );

            // Get formatting options from editor
            const options = {
              tabSize: (editor.options.tabSize as number) || 2,
              insertSpaces: editor.options.insertSpaces as boolean,
            };

            // Try to get formatting edits for this range
            const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
              "vscode.executeFormatRangeProvider",
              document.uri,
              formatRange,
              options
            );

            // If we got formatting edits, analyze what indentation would be applied
            if (edits && edits.length > 0) {
              // Look for edits that affect our target line
              for (const edit of edits) {
                if (edit.range.start.line === lineNumber) {
                  // Extract indentation from the formatted text
                  const formattedText = edit.newText;
                  const indentMatch = formattedText.match(/^(\s*)/);
                  return indentMatch ? indentMatch[1] : "";
                }
              }
            }

            // Fallback: analyze context manually
            const contextLine = document.lineAt(contextLineNumber);
            const contextIndent = contextLine.text.match(/^(\s*)/)?.[0] || "";
            const trimmedText = contextLine.text.trim();

            // Check if this line indicates we should increase indentation
            const shouldIncreaseIndent = /[{\[\(:]$/.test(trimmedText);

            if (shouldIncreaseIndent) {
              const indentUnit = options.insertSpaces ? " ".repeat(options.tabSize) : "\t";
              return contextIndent + indentUnit;
            } else {
              return contextIndent;
            }
          } catch (formatError) {
            // Formatting failed, fall back to context analysis
            const contextLine = document.lineAt(contextLineNumber);
            return contextLine.text.match(/^(\s*)/)?.[0] || "";
          }
        }
        contextLineNumber--;
      }
    }

    // No context above, check below
    let contextLineNumber = lineNumber + 1;
    while (contextLineNumber < document.lineCount) {
      const line = document.lineAt(contextLineNumber);
      if (line.text.trim().length > 0) {
        // Found a non-empty line below, use its indentation
        return line.text.match(/^(\s*)/)?.[0] || "";
      }
      contextLineNumber++;
    }

    // No context found, return empty indentation
    return "";
  } catch (error) {
    // Fallback: return empty indentation
    return "";
  }
}

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
        printPasteReplaceOutput("Executing editor.action.reindentselectedlines");
        await vscode.commands.executeCommand("editor.action.reindentselectedlines");
      }

      // Use our custom replace functionality for the now empty lines
      await replaceLineWithClipboard(true); // true = use smart indentation
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

      // For whitespace-only lines, our smart indentation detection handles proper indentation
      // No need to reindent since we'll calculate the correct indentation anyway

      // Use our custom replace functionality for whitespace-only lines
      await replaceLineWithClipboard(true); // true = use smart indentation
    } else {
      printPasteReplaceOutput("Using standard paste for non-empty lines");
      // Use VSCode's default paste action for lines with content
      await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
    }
  };

  const replaceLineWithClipboard = async (useSmartIndentation: boolean = false) => {
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

      // Pre-calculate indentation for cursor positions
      const cursorIndentations: Map<number, string> = new Map();

      if (cursors.length > 0) {
        const cursorLines = cursors.map((selection) => selection.active.line);
        const uniqueCursorLines = [...new Set(cursorLines)];

        for (const currentLine of uniqueCursorLines) {
          const lineText = editor.document.lineAt(currentLine);
          const cursorPosition = new vscode.Position(currentLine, 0);

          let leadingWhitespace = "";

          if (useSmartIndentation && lineText.text.trim() === "") {
            printPasteReplaceOutput("Detecting smart indentation");
            // For smart paste on empty/whitespace lines, detect smart indentation
            try {
              leadingWhitespace = await detectSmartIndentation(editor, cursorPosition);
            } catch (error) {
              // Fallback to existing logic
              leadingWhitespace = lineText.text.match(/^\s*/)?.[0] || "";
            }
          } else {
            printPasteReplaceOutput("Using existing indentation");
            // For replace paste or non-empty lines, use existing indentation
            leadingWhitespace = lineText.text.match(/^\s*/)?.[0] || "";
          }

          cursorIndentations.set(currentLine, leadingWhitespace);
        }
      }

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

        // Handle cursor positions (no selection) - use pre-calculated indentations
        if (cursors.length > 0) {
          // Collect all cursor positions and sort them in reverse order (bottom to top)
          const cursorLines = cursors.map((selection) => selection.active.line).sort((a, b) => b - a);

          // Remove duplicates (in case multiple cursors are on the same line)
          const uniqueCursorLines = [...new Set(cursorLines)];

          // Process each cursor position using pre-calculated indentations
          for (const currentLine of uniqueCursorLines) {
            const lineText = editor.document.lineAt(currentLine);
            const leadingWhitespace = cursorIndentations.get(currentLine) || "";

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
    vscode.commands.registerCommand("vstoys.paste-replace.clipboardPasteReplace", () =>
      replaceLineWithClipboard(false)
    ), // false = match existing indentation
    vscode.commands.registerCommand("vstoys.paste-replace.clipboardPasteSmart", smartPaste)
  );

  vscode.commands.executeCommand("setContext", "vstoys.paste-replace.active", true);

  printPasteReplaceOutput(`${name} activated`, false);
}
