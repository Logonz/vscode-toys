import * as vscode from "vscode";
import { createOutputChannel } from "../extension";

let printPasteReplaceOutput: (content: string, reveal?: boolean) => void;

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

      // Get current line
      const currentLine = editor.selection.active.line;
      const lineText = editor.document.lineAt(currentLine);

      // Extract leading whitespace (indentation)
      const leadingWhitespace = lineText.text.match(/^\s*/)?.[0] || "";

      // Process clipboard content - take first line and trim it
      const clipboardContent = clipboardText.split("\n")[0].trim();

      // Create new line content with preserved indentation
      const newLineContent = leadingWhitespace + clipboardContent;

      // Replace the entire line
      await editor.edit((editBuilder) => {
        const fullLineRange = lineText.range;
        editBuilder.replace(fullLineRange, newLineContent);
      });

      printPasteReplaceOutput(`Replaced line ${currentLine + 1} with clipboard content`);
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
