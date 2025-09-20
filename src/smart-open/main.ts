import * as vscode from "vscode";
import { LoadIcons } from "./icons";
import { updateFilesExcludeCache, updateSearchExcludeCache } from "./files";
import { showDebugQuickPick } from "./debugQuickPick";
import { updateCustomLabelConfiguration } from "../helpers/customEditorLabelService";
import { updateDetailsDebug, showQuickPickWithInlineSearch } from "./picks/fileListWithFuzzy";
import { createOutputChannel } from "../extension";
import { ScoreCalculator } from "./scoring";
import {
  initializeGitignoreWatchers,
  handleWorkspaceFoldersChanged,
  disposeGitignoreWatchers,
  clearGitignoreCache,
} from "./gitignoreCache";

export let scoreCalculator: ScoreCalculator;

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

    if (event.affectsConfiguration("vstoys.smart-open.debugDetails")) {
      updateDetailsDebug(vscode.workspace.getConfiguration("vstoys.smart-open").get("debugDetails", false));
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

  // Listen for workspace folder changes to handle gitignore cache
  const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
    printSmartOpenOutput("Workspace folders changed - updating gitignore watchers");
    handleWorkspaceFoldersChanged(event);
  });

  context.subscriptions.push(debugCommand);
  context.subscriptions.push(smartOpenCommand);
  context.subscriptions.push(configChangeListener);
  context.subscriptions.push(excludeListener);
  context.subscriptions.push(workspaceListener);

  // Initialize all icons
  LoadIcons();

  // Initialize exclude listeners
  updateSearchExcludeCache();
  updateFilesExcludeCache();

  // Initialize the custom editor label service
  updateCustomLabelConfiguration();

  // Initialize gitignore watchers
  initializeGitignoreWatchers();

  scoreCalculator = new ScoreCalculator(context);

  printSmartOpenOutput(`${name} activated`);
}

export function deactivateSmartOpen() {
  printSmartOpenOutput("Smart Open deactivating - cleaning up caches");

  // Clean up gitignore watchers and cache
  disposeGitignoreWatchers();
  clearGitignoreCache();
}
