// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { createOutputChannel } from "../extension";
import { navigateToLine, navigateToRelativeLine } from "./navigation";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
let printGotoLineOutput: (content: string, reveal?: boolean) => void;
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
          vscode.commands.executeCommand("vstoys.hyper.deactivateAll");
        } catch (error) {
          console.error("Error executing hyper command:", error);
        }

        const lineNumber = parseInt(result.trim());
        if (!isNaN(lineNumber) && lineNumber >= 1 && lineNumber <= totalLines) {
          navigateToLine(editor, lineNumber, args, printGotoLineOutput);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vstoys.goto-line.goto-relative", async (args) => {
      console.log(args);
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active text editor");
        return;
      }

      const document = editor.document;
      const totalLines = document.lineCount;
      const currentLine = editor.selection.active.line + 1; // VS Code uses 0-based indexing

      // Store current line number settings
      const config = vscode.workspace.getConfiguration('editor');
      const originalLineNumbers = config.get('lineNumbers');

      try {
        // Temporarily enable relative line numbers
        await config.update('lineNumbers', 'relative', vscode.ConfigurationTarget.Global);

        // Show input box for relative line offset
        const result = await vscode.window.showInputBox({
          prompt: `Go to relative line (+/- offset)`,
          placeHolder: `Enter relative offset (e.g., +5, -3, 10, ${args?.upCharacter || 'k'}5, ${args?.downCharacter || 'j'}5) (current: ${currentLine}/${totalLines})`,
          validateInput: (value: string) => {
            if (!value.trim()) {
              return "Please enter a relative offset";
            }

            const trimmedValue = value.trim();
            let offset: number;

            // Get configured characters (with defaults)
            const upChar = args?.upCharacter || 'k';
            const downChar = args?.downCharacter || 'j';

            // Handle single character inputs (allow them without error)
            if (trimmedValue === '+' || trimmedValue === '-' || trimmedValue === upChar || trimmedValue === downChar) {
              return null; // Allow incomplete input
            }

            // Handle various prefixes
            if (trimmedValue.startsWith('+')) {
              const numStr = trimmedValue.substring(1);
              offset = parseInt(numStr);
            } else if (trimmedValue.startsWith('-')) {
              const numStr = trimmedValue.substring(1);
              offset = parseInt(numStr);
              if (!isNaN(offset)) {
                offset = -offset; // make it negative
              }
            } else if (trimmedValue.startsWith(upChar)) {
              const numStr = trimmedValue.substring(upChar.length);
              const num = parseInt(numStr);
              offset = isNaN(num) ? NaN : -num; // negative for up
            } else if (trimmedValue.startsWith(downChar)) {
              const numStr = trimmedValue.substring(downChar.length);
              const num = parseInt(numStr);
              offset = isNaN(num) ? NaN : num; // positive for down
            } else {
              // Plain number defaults to positive (down)
              offset = parseInt(trimmedValue);
            }

            if (isNaN(offset)) {
              return `Please enter a valid number with optional +/-, ${upChar} (up), or ${downChar} (down) prefix`;
            }

            // Calculate target line to validate bounds
            const currentLineIndex = editor.selection.active.line; // 0-based
            const targetLineIndex = currentLineIndex + offset;
            const targetLineDisplay = targetLineIndex + 1; // 1-based for display

            if (targetLineIndex < 0 || targetLineIndex >= totalLines) {
              return `Target line ${targetLineDisplay} is out of bounds (1-${totalLines})`;
            }

            return null; // No error
          }
        });

        // Handle the result
        if (result !== undefined) {
          try {
            vscode.commands.executeCommand("vstoys.hyper.deactivateAll");
          } catch (error) {
            console.error("Error executing hyper command:", error);
          }

          const trimmedValue = result.trim();
          let offset: number;

          // Get configured characters (with defaults)
          const upChar = args?.upCharacter || 'k';
          const downChar = args?.downCharacter || 'j';

          // Parse the offset
          if (trimmedValue.startsWith('+')) {
            offset = parseInt(trimmedValue.substring(1));
          } else if (trimmedValue.startsWith('-')) {
            offset = parseInt(trimmedValue);
          } else if (trimmedValue.startsWith(upChar)) {
            const numStr = trimmedValue.substring(upChar.length);
            const num = parseInt(numStr);
            offset = isNaN(num) ? NaN : -num; // negative for up
          } else if (trimmedValue.startsWith(downChar)) {
            const numStr = trimmedValue.substring(downChar.length);
            const num = parseInt(numStr);
            offset = isNaN(num) ? NaN : num; // positive for down
          } else {
            // Plain number defaults to positive (down)
            offset = parseInt(trimmedValue);
          }

          if (!isNaN(offset)) {
            navigateToRelativeLine(editor, offset, args, printGotoLineOutput);
          }
        }
      } finally {
        // Always restore the original line number setting
        await config.update('lineNumbers', originalLineNumbers, vscode.ConfigurationTarget.Global);
      }
    })
  );

  printGotoLineOutput(`${name} activated`, false);
}
