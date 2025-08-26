// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { createOutputChannel } from "../extension";
import { navigateToLine, navigateToRelativeLine } from "./navigation";
import { GotoLinePreview } from "./preview";
import { GotoLineSettingsManager, getGotoLineSettings } from "./settings";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
let printGotoLineOutput: (content: string, reveal?: boolean) => void;
let gotoLinePreview: GotoLinePreview;
let settingsManager: GotoLineSettingsManager;
export function activateGotoLine(name: string, context: vscode.ExtensionContext) {
  console.log(`Activating ${name}`);
  printGotoLineOutput = createOutputChannel(`${name}`);
  printGotoLineOutput(`${name} activating`);

  // Initialize settings manager
  settingsManager = new GotoLineSettingsManager();
  context.subscriptions.push(settingsManager);

  // Initialize preview manager with current settings
  gotoLinePreview = new GotoLinePreview(settingsManager.settings);
  context.subscriptions.push(gotoLinePreview);

  // Listen for settings changes and update preview
  settingsManager.onSettingsChanged((newSettings) => {
    gotoLinePreview.updateSettings(newSettings);
  });  context.subscriptions.push(
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
          // Clear previous preview
          gotoLinePreview.clearPreview();

          if (!value.trim()) {
            return "Please enter a line number";
          }

          const targetLine = parseAbsoluteLineInput(value, totalLines);

          if (targetLine === null) {
            return `Line number must be between 1 and ${totalLines}`;
          }

          // Show preview of what will happen
          gotoLinePreview.previewAbsoluteLineSelection(editor, targetLine, args);

          return null; // No error
        }
      });

      // Handle the result
      if (result !== undefined) {
        // Clear preview before executing
        gotoLinePreview.clearPreview();

        try {
          vscode.commands.executeCommand("vstoys.hyper.deactivateAll");
        } catch (error) {
          console.error("Error executing hyper command:", error);
        }

        const targetLine = parseAbsoluteLineInput(result, totalLines);
        if (targetLine !== null) {
          navigateToLine(editor, targetLine, args, printGotoLineOutput);
        }
      } else {
        // Clear preview if user cancelled
        gotoLinePreview.clearPreview();
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
          placeHolder: `Enter relative offset (e.g., +5, -3, 10, ${settingsManager.settings.upCharacter}5, ${settingsManager.settings.downCharacter}5) (current: ${currentLine}/${totalLines})`,
          validateInput: (value: string) => {
            // Clear previous preview
            gotoLinePreview.clearPreview();

            if (!value.trim()) {
              return "Please enter a relative offset";
            }

            const trimmedValue = value.trim();

            // Get configured characters from settings
            const upChar = settingsManager.settings.upCharacter;
            const downChar = settingsManager.settings.downCharacter;

            // Handle single character inputs (allow them without error)
            if (trimmedValue === '+' || trimmedValue === '-' || trimmedValue === upChar || trimmedValue === downChar) {
              return null; // Allow incomplete input
            }

            const offset = parseRelativeLineInput(value, settingsManager.settings);

            if (offset === null) {
              return `Please enter a valid number with optional +/-, ${upChar} (up), or ${downChar} (down) prefix`;
            }

            // Calculate target line to validate bounds
            const currentLineIndex = editor.selection.active.line; // 0-based
            const targetLineIndex = currentLineIndex + offset;
            const targetLineDisplay = targetLineIndex + 1; // 1-based for display

            if (targetLineIndex < 0 || targetLineIndex >= totalLines) {
              return `Target line ${targetLineDisplay} is out of bounds (1-${totalLines})`;
            }

            // Show preview of what will happen
            gotoLinePreview.previewRelativeLineSelection(editor, offset, args);

            return null; // No error
          }
        });

        // Handle the result
        if (result !== undefined) {
          // Clear preview before executing
          gotoLinePreview.clearPreview();

          try {
            vscode.commands.executeCommand("vstoys.hyper.deactivateAll");
          } catch (error) {
            console.error("Error executing hyper command:", error);
          }

          const offset = parseRelativeLineInput(result, settingsManager.settings);
          if (offset !== null) {
            navigateToRelativeLine(editor, offset, args, printGotoLineOutput);
          }
        } else {
          // Clear preview if user cancelled
          gotoLinePreview.clearPreview();
        }
      } finally {
        // Always restore the original line number setting and clear preview
        await config.update('lineNumbers', originalLineNumbers, vscode.ConfigurationTarget.Global);
        gotoLinePreview.clearPreview();
      }
    })
  );

  printGotoLineOutput(`${name} activated`, false);
}

/**
 * Parse user input for absolute line navigation and return the target line number
 * @param input The user input string
 * @param totalLines Total number of lines in the document
 * @returns The target line number (1-based) or null if invalid
 */
function parseAbsoluteLineInput(input: string, totalLines: number): number | null {
  if (!input.trim()) {
    return null;
  }

  const lineNumber = parseInt(input.trim());
  if (isNaN(lineNumber) || lineNumber < 1 || lineNumber > totalLines) {
    return null;
  }

  return lineNumber;
}

/**
 * Parse user input for relative line navigation and return the offset
 * @param input The user input string
 * @param settings Settings containing up/down characters
 * @returns The relative offset or null if invalid
 */
function parseRelativeLineInput(input: string, settings: { upCharacter: string; downCharacter: string }): number | null {
  if (!input.trim()) {
    return null;
  }

  const trimmedValue = input.trim();
  let offset: number;

  // Get configured characters from settings
  const upChar = settings.upCharacter;
  const downChar = settings.downCharacter;

  // Handle single character inputs (return null for incomplete input)
  if (trimmedValue === '+' || trimmedValue === '-' || trimmedValue === upChar || trimmedValue === downChar) {
    return null;
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
    return null;
  }

  return offset;
}
