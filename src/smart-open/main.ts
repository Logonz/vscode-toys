// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { InitializeFind, SpawnQuickPick } from "./find";
import { createOutputChannel } from "../extension";
import { updateCustomLabelConfiguration } from "../helpers/customEditorLabelService";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
export let printJumpOutput: (content: string, reveal?: boolean) => void;

export function activateSmartOpen(context: vscode.ExtensionContext) {
  printJumpOutput = createOutputChannel("Smart Open");
  printJumpOutput("Smart Oopen activating");
  InitializeFind(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("vstoys.smart-open.openSmart", async () => {
      await SpawnQuickPick();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("workbench.editor.customLabels.enabled") ||
        event.affectsConfiguration("workbench.editor.customLabels.patterns")
      ) {
        updateCustomLabelConfiguration();
      }
    })
  );

  printJumpOutput("Smart Open activated", false);
}
