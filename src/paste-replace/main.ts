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
    return '\r\n';
  } else {
    return '\n';
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
  while (clipboardLines.length > 0 && clipboardLines[clipboardLines.length - 1].trim() === '') {
    clipboardLines.pop();
  }

  if (clipboardLines.length === 0) {
    return [''];
  }

  // Find the minimum indentation level (base level to anchor from)
  let minIndentation = Infinity;
  const lineIndentations: string[] = [];

  for (const line of clipboardLines) {
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
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
      processedLines.push('');
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

      // Collect all cursor positions and sort them in reverse order (bottom to top)
      // This prevents line number shifts from affecting subsequent operations
      const cursors = editor.selections
        .map(selection => selection.active.line)
        .sort((a, b) => b - a); // Sort in descending order

      // Remove duplicates (in case multiple cursors are on the same line)
      const uniqueCursors = [...new Set(cursors)];

      // Process each cursor position
      await editor.edit((editBuilder) => {
        for (const currentLine of uniqueCursors) {
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
      });

      const cursorCount = uniqueCursors.length;
      const lineNumbers = uniqueCursors.sort((a, b) => a - b).map(line => line + 1).join(', ');
      printPasteReplaceOutput(`Replaced ${cursorCount} line(s) [${lineNumbers}] with clipboard content`);
    } catch (error) {
      vscode.window.showErrorMessage(`Paste replace failed: ${error}`);
      printPasteReplaceOutput(`Error: ${error}`);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("vstoys.paste-replace.replaceLineWithClipboard", replaceLineWithClipboard)
  );

  vscode.commands.executeCommand("setContext", "vstoys.paste-replace.active", true);

  printPasteReplaceOutput(`${name} activated`, false);
}
