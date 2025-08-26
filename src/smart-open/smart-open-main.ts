import * as vscode from "vscode";
import { LoadIcons } from "./icons";
import { GetAllFilesInWorkspace, updateFilesExcludeCache, updateSearchExcludeCache } from "./files";
import { showDebugQuickPick } from "./debugQuickPick";
import { updateCustomLabelConfiguration } from "../helpers/customEditorLabelService";
import { showQuickPickWithInlineSearch } from "./picks/fileListWithFuzzy";
import { coChangeScores } from "./git";

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

  // Safely access the first workspace folder (workspaceFolders may be undefined)
  const firstWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (firstWorkspaceFolder) {
    const workspacePath = firstWorkspaceFolder.uri.fsPath;
    console.log(workspacePath);
    // Initialize the git change scorer
    console.log(
      await coChangeScores({
        // repoRoot: workspacePath,
        // targetRelPath: "approle.tf",
        repoRoot: "/Users/david.holmstedt/projects/vscode-toys",
        targetRelPath: "package.json",
      })
    );
  } else {
    // No workspace open; skip git-based initialization
    // console.debug("No workspace folder available; skipping git co-change scorer initialization.");
  }

  // Initialize the custom editor label service
  updateCustomLabelConfiguration();
}
