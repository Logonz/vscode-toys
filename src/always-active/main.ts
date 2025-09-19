// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { createOutputChannel } from "../extension";
import path from "path";
import os from "os";
import { openFile } from "./openFile";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
let printAlwaysActiveOutput: (content: string, reveal?: boolean) => void;

export function activateAlwaysActive(name: string, context: vscode.ExtensionContext) {
  console.log(`Activating ${name}`);
  printAlwaysActiveOutput = createOutputChannel(`${name}`);
  printAlwaysActiveOutput(`${name} activating`);

  async function g() {
    if (vscode.window.activeTextEditor) {
      // const currentSelection = vscode.window.activeTextEditor.selection.active;
      const result = await vscode.commands.executeCommand(
        "vscode.executeDocumentSymbolProvider",
        // "vscode.executeDocumentHighlights",
        vscode.window.activeTextEditor.document.uri
        // vscode.window.activeTextEditor.selection.active
      );
      console.log(result);

      const selectedRange = vscode.window.activeTextEditor.selection;
      const legend = await vscode.commands.executeCommand(
        "vscode.provideDocumentRangeSemanticTokensLegend",
        // "vscode.provideDocumentSemanticTokensLegend",
        // "vscode.executeDocumentHighlights",
        vscode.window.activeTextEditor.document.uri,
        selectedRange
        // vscode.window.activeTextEditor.selection.active
      );
      console.log(legend);

      const tokens = await vscode.commands.executeCommand(
        "vscode.provideDocumentRangeSemanticTokens",
        // "vscode.provideDocumentSemanticTokens",
        // "vscode.executeDocumentHighlights",
        vscode.window.activeTextEditor.document.uri,
        selectedRange
        // vscode.window.activeTextEditor.selection.active
      );
      console.log(tokens);
    }
  }

  context.subscriptions.push(vscode.commands.registerCommand("vstoys.openFile", openFile));
  context.subscriptions.push(vscode.commands.registerCommand("vstoys.test", g));

  printAlwaysActiveOutput(`${name} activated`, false);
}
