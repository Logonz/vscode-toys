import * as vscode from "vscode";
import { LoadIcons } from "./icons";
import { updateFilesExcludeCache, updateSearchExcludeCache } from "./files";
import { showDebugQuickPick } from "./debugQuickPick";
import { updateCustomLabelConfiguration } from "../helpers/customEditorLabelService";
import { showQuickPickWithInlineSearch } from "./picks/fileListWithFuzzy";
import { createOutputChannel } from "../extension";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
export let printSmartOpenOutput: (content: string, reveal?: boolean) => void;

export async function activateSmartOpen(name: string, context: vscode.ExtensionContext) {
  printSmartOpenOutput = createOutputChannel(name);
  printSmartOpenOutput(`${name} activating`);

  const debugCommand = vscode.commands.registerCommand("vstoys.debug.showQuickPick", async () => {
    await showDebugQuickPick();
  });

  const smartOpenCommand = vscode.commands.registerCommand("vstoys.smart-open.showQuickPick", async () => {
    await showQuickPickWithInlineSearch();
  });

  const configChangeListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (
      event.affectsConfiguration("workbench.editor.customLabels.enabled") ||
      event.affectsConfiguration("workbench.editor.customLabels.patterns") ||
      event.affectsConfiguration("vstoys.smart-open.maxWorkspaceFiles")
    ) {
      updateCustomLabelConfiguration();
    }

    if (event.affectsConfiguration("workbench.iconTheme")) {
      LoadIcons();
    }
  });

  const excludeListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("search.exclude")) {
      updateSearchExcludeCache();
    } else if (event.affectsConfiguration("files.exclude")) {
      updateFilesExcludeCache();
    }
  });

  context.subscriptions.push(debugCommand);
  context.subscriptions.push(smartOpenCommand);
  context.subscriptions.push(configChangeListener);
  context.subscriptions.push(excludeListener);

  // Initialize all icons
  LoadIcons();

  // Initialize exclude listeners
  updateSearchExcludeCache();
  updateFilesExcludeCache();

  // Initialize the custom editor label service
  updateCustomLabelConfiguration();
}
