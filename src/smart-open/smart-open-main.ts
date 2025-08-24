import * as vscode from "vscode";
import { LoadIcons } from "./icons";
import { GetAllFilesInWorkspace, updateFilesExcludeCache, updateSearchExcludeCache } from "./files";
import { showDebugQuickPick } from "./debugQuickPick";
import { updateCustomLabelConfiguration } from "../helpers/customEditorLabelService";
import { showQuickPickWithInlineSearch } from "./picks/fileListWithFuzzy";

export function activateSmartOpen(name: string, context: vscode.ExtensionContext) {

  // Initialize all icons
  // TODO: Reload with icon theme change.
  LoadIcons();


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

  // Initialize exclude listeners
  updateSearchExcludeCache();
  updateFilesExcludeCache();

  // Initialize the custom editor label service
  updateCustomLabelConfiguration();
}
