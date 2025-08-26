import * as vscode from "vscode";
import { GetIconForFile, LoadIcons, batchLoadIcons, getIconCacheStats, clearIconCache } from "./icons";
import { GetAllFilesInWorkspace } from "./files";
import {
  CustomEditorLabelService,
  GetCustomLabelForFile,
  GetMaxWorkspaceFiles,
  ICustomEditorLabelPatterns,
  IsCustomLabelsEnabled,
} from "../helpers/customEditorLabelService";
import { FileQuickPickItem } from "./picks/interface/IFileQuickPickItem";
import { showFileListWithIcons } from "./picks/testPickers/fileListWithIcons";
import { showFileListWithCustomLabels } from "./picks/testPickers/fileListWithCustomLabels";
import { showFileListWithFuzzy } from "./picks/fileListWithFuzzy";

interface DebugQuickPickItem extends vscode.QuickPickItem {
  action: string;
}

export async function showDebugQuickPick(): Promise<void> {
  const items: DebugQuickPickItem[] = [
    {
      label: "$(file) Test File Loading",
      description: "Load and display all files in workspace",
      action: "testFiles",
    },
    {
      label: "$(symbol-color) Test Icon Loading",
      description: "Load icons and test icon resolution",
      action: "testIcons",
    },
    {
      label: "$(zap) Test Performance Icon Loading",
      description: "Test optimized batch icon loading",
      action: "testBatchIcons",
    },
    {
      label: "$(list-unordered) Show File List",
      description: "Display all workspace files with icons",
      action: "showFileList",
    },
    {
      label: "$(list-unordered) Show File List (Custom Labels)",
      description: "Display all workspace files with icons and custom labels",
      action: "showFileListCustomLabels",
    },
    {
      label: "$(list-unordered) Show File List (Fuzzy Search)",
      description: "Display all workspace files with icons and fuzzy search",
      action: "showFileListFuzzy",
    },
    {
      label: "$(graph) Icon Cache Stats",
      description: "Show icon cache performance statistics",
      action: "showCacheStats",
    },
    {
      label: "$(trash) Clear Icon Cache",
      description: "Clear all cached icons",
      action: "clearCache",
    },
    {
      label: "$(gear) Test Configuration",
      description: "Show current VS Code configuration",
      action: "testConfig",
    },
    {
      label: "$(debug-console) Console Logs",
      description: "Open output channel for debugging",
      action: "openConsole",
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select debug action",
  });

  if (picked) {
    await executeDebugAction(picked.action);
  }
}

async function executeDebugAction(action: string): Promise<void> {
  switch (action) {
    case "testFiles":
      await testFileLoading();
      break;
    case "testIcons":
      await testIconLoading();
      break;
    case "testBatchIcons":
      await testBatchIconLoading();
      break;
    case "showFileList":
      await showFileListWithIcons();
      break;
    case "showFileListCustomLabels":
      await showFileListWithCustomLabels();
      break;
    case "showFileListFuzzy":
      await showFileListWithFuzzy("");
      break;
    case "showCacheStats":
      await showIconCacheStats();
      break;
    case "clearCache":
      await clearIconCacheAction();
      break;
    case "testConfig":
      await testConfiguration();
      break;
    case "openConsole":
      await openDebugConsole();
      break;
  }
}

async function testFileLoading(): Promise<void> {
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Loading files...",
      cancellable: false,
    },
    async () => {
      const files = await GetAllFilesInWorkspace();
      vscode.window.showInformationMessage(`Found ${files.length} files in workspace`);
      console.log("Files loaded:", files);
    }
  );
}

async function testIconLoading(): Promise<void> {
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Loading icons...",
      cancellable: false,
    },
    async () => {
      LoadIcons();
      vscode.window.showInformationMessage("Icons loaded - check console for details");
    }
  );
}

async function testBatchIconLoading(): Promise<void> {
  // Lets always load icons before testing
  LoadIcons();
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Testing batch vs serial icon loading...",
      cancellable: false,
    },
    async (progress) => {
      const files = await GetAllFilesInWorkspace();
      const testFiles = files.slice(0, 100); // Test with first 100 files

      // Test serial loading (like showFileListWithIcons)
      progress.report({ message: "Testing serial loading..." });
      clearIconCache();
      const serialStartTime = performance.now();

      for (const file of testFiles) {
        const icon = await GetIconForFile(file);
      }

      const serialEndTime = performance.now();
      const serialStats = getIconCacheStats();
      const serialTime = serialEndTime - serialStartTime;

      // Test batch loading
      progress.report({ message: "Testing batch loading..." });
      clearIconCache();
      const batchStartTime = performance.now();

      await batchLoadIcons(testFiles);

      const batchEndTime = performance.now();
      const batchStats = getIconCacheStats();
      const batchTime = batchEndTime - batchStartTime;

      // Show comparison results
      const improvement = (((serialTime - batchTime) / serialTime) * 100).toFixed(1);

      vscode.window.showInformationMessage(
        `Icon Loading Performance Test (${testFiles.length} files):\n` +
          `Serial: ${serialTime.toFixed(2)}ms (${serialStats.hits} hits, ${serialStats.misses} misses)\n` +
          `Batch: ${batchTime.toFixed(2)}ms (${batchStats.hits} hits, ${batchStats.misses} misses)\n` +
          `Improvement: ${improvement}% faster`
      );

      console.log("Serial loading stats:", serialStats);
      console.log("Batch loading stats:", batchStats);
    }
  );
}

async function showIconCacheStats(): Promise<void> {
  const stats = getIconCacheStats();
  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? ((stats.hits / total) * 100).toFixed(1) : "0";

  vscode.window.showInformationMessage(
    `Icon Cache Stats: ${stats.hits} hits, ${stats.extensionHits} extension hits, ${stats.misses} misses. Hit rate: ${hitRate}%`
  );

  console.log("Detailed icon cache stats:", stats);
}

async function clearIconCacheAction(): Promise<void> {
  clearIconCache();
  vscode.window.showInformationMessage("Icon cache cleared");
}

async function testConfiguration(): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const workbenchConfig = config.get("workbench");

  console.log("Workbench configuration:", workbenchConfig);
  vscode.window.showInformationMessage("Configuration logged to console");
}

async function openDebugConsole(): Promise<void> {
  vscode.commands.executeCommand("workbench.action.toggleDevTools");
}

async function GenerateItemList(files: vscode.Uri[]): Promise<void> {
  let internalFiles: { uri: vscode.Uri; customLabel: string; relativePath: string; fsPath: string }[] = [];

  const customLabelsEnabled: boolean | undefined = vscode.workspace
    .getConfiguration("workbench")
    .get<boolean>("editor.customLabels.enabled");

  if (customLabelsEnabled && customLabelsEnabled === true) {
    const customLabelsPatterns: ICustomEditorLabelPatterns | undefined = vscode.workspace
      .getConfiguration("workbench")
      .get<ICustomEditorLabelPatterns>("editor.customLabels.patterns");

    if (customLabelsPatterns) {
      const labelService = new CustomEditorLabelService(customLabelsPatterns);
      files.forEach((file) => {
        const label = labelService.getName(file);
        const fileObject = {
          uri: file,
          fsPath: file.fsPath,
          relativePath: vscode.workspace.asRelativePath(file),
          customLabel: label ? label : vscode.workspace.asRelativePath(file),
        };
        internalFiles.push(fileObject);
      });
    }
  }

  console.log(internalFiles);
}
