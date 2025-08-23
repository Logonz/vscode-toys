import * as vscode from "vscode";
import { GetIconForFile, LoadIcons, batchLoadIcons, getIconCacheStats, clearIconCache } from "./icons";
import { GetAllFilesInWorkspace } from "./files";
import { CustomEditorLabelService, GetCustomLabelForFile, GetMaxWorkspaceFiles, ICustomEditorLabelPatterns, IsCustomLabelsEnabled } from "./helpers/customEditorLabelService";



export interface FileQuickPickItem extends vscode.QuickPickItem {
  file: vscode.Uri;
  // filePath: string;
  // relativePath: string;
  // rawScore: number;
  // recencyScore: number;
  // frequencyScore: number;
  // closeScore: number;
  // finalScore: number;
}

interface DebugQuickPickItem extends vscode.QuickPickItem {
  action: string;
}

export async function showDebugQuickPick(): Promise<void> {
  const items: DebugQuickPickItem[] = [
    {
      label: "$(file) Test File Loading",
      description: "Load and display all files in workspace",
      action: "testFiles"
    },
    {
      label: "$(symbol-color) Test Icon Loading",
      description: "Load icons and test icon resolution",
      action: "testIcons"
    },
    {
      label: "$(zap) Test Performance Icon Loading",
      description: "Test optimized batch icon loading",
      action: "testBatchIcons"
    },
    {
      label: "$(list-unordered) Show File List",
      description: "Display all workspace files with icons",
      action: "showFileList"
    },
    {
      label: "$(list-unordered) Show File List (Custom Labels)",
      description: "Display all workspace files with icons and custom labels",
      action: "showFileListCustomLabels"
    },
    {
      label: "$(graph) Icon Cache Stats",
      description: "Show icon cache performance statistics",
      action: "showCacheStats"
    },
    {
      label: "$(trash) Clear Icon Cache",
      description: "Clear all cached icons",
      action: "clearCache"
    },
    {
      label: "$(gear) Test Configuration",
      description: "Show current VS Code configuration",
      action: "testConfig"
    },
    {
      label: "$(debug-console) Console Logs",
      description: "Open output channel for debugging",
      action: "openConsole"
    }
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select debug action"
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
  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Loading files...",
    cancellable: false
  }, async () => {
    const files = await GetAllFilesInWorkspace();
    vscode.window.showInformationMessage(`Found ${files.length} files in workspace`);
    console.log("Files loaded:", files);
  });
}

async function testIconLoading(): Promise<void> {
  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Loading icons...",
    cancellable: false
  }, async () => {
    LoadIcons();
    vscode.window.showInformationMessage("Icons loaded - check console for details");
  });
}

async function testBatchIconLoading(): Promise<void> {
  // Lets always load icons before testing
  LoadIcons();
  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Testing batch vs serial icon loading...",
    cancellable: false
  }, async (progress) => {
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
    const improvement = ((serialTime - batchTime) / serialTime * 100).toFixed(1);

    vscode.window.showInformationMessage(
      `Icon Loading Performance Test (${testFiles.length} files):\n` +
      `Serial: ${serialTime.toFixed(2)}ms (${serialStats.hits} hits, ${serialStats.misses} misses)\n` +
      `Batch: ${batchTime.toFixed(2)}ms (${batchStats.hits} hits, ${batchStats.misses} misses)\n` +
      `Improvement: ${improvement}% faster`
    );

    console.log("Serial loading stats:", serialStats);
    console.log("Batch loading stats:", batchStats);
  });
}

async function showFileListWithIcons(): Promise<void> {
  const totalStart = performance.now();

  console.log("=== Performance Profile: showFileListWithIcons ===");

  const fileLoadStart = performance.now();
  const files = await GetAllFilesInWorkspace();
  const fileLoadEnd = performance.now();
  console.log(`1. File loading: ${(fileLoadEnd - fileLoadStart).toFixed(2)}ms (${files.length} files)`);

  const iconLoadStart = performance.now();
  const items: FileQuickPickItem[] = [];
  const testFiles = files.slice(0, 50);

  // Batch load icons for all test files
  await batchLoadIcons(testFiles);

  for (let i = 0; i < testFiles.length; i++) {
    const file = testFiles[i];
    const fileStart = performance.now();

    // Get the precached icons
    const icon = await GetIconForFile(file);
    const iconTime = performance.now() - fileStart;

    const relativePath = vscode.workspace.asRelativePath(file);

    items.push({
      // label: `iI:$(iconIdentifier) f:$(file) p:$(pencil) ts:$(typescript) ${relativePath}`,
      label: relativePath,
      description: icon ? `Has icon (${iconTime.toFixed(1)}ms)` : `No icon (${iconTime.toFixed(1)}ms)`,
      file: file,
      // filePath: file.fsPath,
      // relativePath: relativePath,
      iconPath: icon ? icon : new vscode.ThemeIcon("file"),
      // rawScore: 0,
      // recencyScore: 0,
      // frequencyScore: 0,
      // closeScore: 0,
      // finalScore: 0
    });

    if (i % 10 === 0) {
      console.log(`  - Processed ${i + 1}/${testFiles.length} files`);
    }
  }

  const iconLoadEnd = performance.now();
  console.log(`2. Icon loading: ${(iconLoadEnd - iconLoadStart).toFixed(2)}ms (${testFiles.length} files)`);
  console.log(`   Average per file: ${((iconLoadEnd - iconLoadStart) / testFiles.length).toFixed(2)}ms`);

  const quickPickStart = performance.now();
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Select file to open (showing first 50 of ${files.length} files)`
  });
  const quickPickEnd = performance.now();
  console.log(`3. QuickPick display: ${(quickPickEnd - quickPickStart).toFixed(2)}ms`);

  if (picked) {
    const openStart = performance.now();
    const doc = await vscode.workspace.openTextDocument(picked.file);
    await vscode.window.showTextDocument(doc);
    const openEnd = performance.now();
    console.log(`4. File opening: ${(openEnd - openStart).toFixed(2)}ms`);
  }

  const totalEnd = performance.now();
  console.log(`=== Total time: ${(totalEnd - totalStart).toFixed(2)}ms ===`);

  const stats = getIconCacheStats();
  console.log(`Icon cache stats: ${stats.hits} hits, ${stats.extensionHits} ext hits, ${stats.misses} misses`);
}

async function showFileListWithCustomLabels(): Promise<void> {
  const totalStart = performance.now();

  console.log("=== Performance Profile: showFileListWithCustomLabels ===");

  const fileLoadStart = performance.now();
  const files = await GetAllFilesInWorkspace();
  const fileLoadEnd = performance.now();
  console.log(`1. File loading: ${(fileLoadEnd - fileLoadStart).toFixed(2)}ms (${files.length} files)`);

  // Custom label processing using cached configuration
  const labelProcessStart = performance.now();
  let internalFiles: { uri: vscode.Uri; customLabel: string; relativePath: string; fsPath: string }[] = [];
  const testFiles = files.slice(0, 50);

  // Use cached configuration instead of reading from workspace every time
  testFiles.forEach((file) => {
    const fileObject = {
      uri: file,
      fsPath: file.fsPath,
      relativePath: vscode.workspace.asRelativePath(file),
      customLabel: GetCustomLabelForFile(file),
    };
    internalFiles.push(fileObject);
  });

  const labelProcessEnd = performance.now();
  console.log(`2. Custom label processing: ${(labelProcessEnd - labelProcessStart).toFixed(2)}ms (${internalFiles.length} files)`);

  const iconLoadStart = performance.now();
  const items: FileQuickPickItem[] = [];

  // Batch load icons for all test files
  await batchLoadIcons(testFiles);

  for (let i = 0; i < internalFiles.length; i++) {
    const fileInfo = internalFiles[i];
    const fileStart = performance.now();

    // Get the precached icons
    const icon = await GetIconForFile(fileInfo.uri);
    const iconTime = performance.now() - fileStart;

    items.push({
      label: fileInfo.customLabel,
      description: icon ? `Has icon (${iconTime.toFixed(1)}ms)` : `No icon (${iconTime.toFixed(1)}ms)`,
      file: fileInfo.uri,
      // filePath: fileInfo.fsPath,
      // relativePath: fileInfo.relativePath,
      iconPath: icon ? icon : new vscode.ThemeIcon("file"),
      // rawScore: 0,
      // recencyScore: 0,
      // frequencyScore: 0,
      // closeScore: 0,
      // finalScore: 0
    });

    if (i % 10 === 0) {
      console.log(`  - Processed ${i + 1}/${internalFiles.length} files`);
    }
  }

  const iconLoadEnd = performance.now();
  console.log(`3. Icon loading: ${(iconLoadEnd - iconLoadStart).toFixed(2)}ms (${testFiles.length} files)`);
  console.log(`   Average per file: ${((iconLoadEnd - iconLoadStart) / testFiles.length).toFixed(2)}ms`);

  const quickPickStart = performance.now();
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Select file to open (showing first 50 of ${files.length} files) - Custom Labels ${IsCustomLabelsEnabled() ? 'ENABLED' : 'DISABLED'}`
  });
  const quickPickEnd = performance.now();
  console.log(`4. QuickPick display: ${(quickPickEnd - quickPickStart).toFixed(2)}ms`);

  if (picked) {
    const openStart = performance.now();
    const doc = await vscode.workspace.openTextDocument(picked.file);
    await vscode.window.showTextDocument(doc);
    const openEnd = performance.now();
    console.log(`5. File opening: ${(openEnd - openStart).toFixed(2)}ms`);
  }

  const totalEnd = performance.now();
  console.log(`=== Total time: ${(totalEnd - totalStart).toFixed(2)}ms ===`);

  const stats = getIconCacheStats();
  console.log(`Icon cache stats: ${stats.hits} hits, ${stats.extensionHits} ext hits, ${stats.misses} misses`);
  console.log(`Custom labels enabled: ${IsCustomLabelsEnabled()}, processed ${internalFiles.length} files`);
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