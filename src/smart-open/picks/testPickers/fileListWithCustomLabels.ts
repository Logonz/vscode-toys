import * as vscode from "vscode";
import { GetIconForFile, LoadIcons, batchLoadIcons, getIconCacheStats, clearIconCache } from "../../icons";
import { GetAllFilesInWorkspace } from "../../files";
import {
  CustomEditorLabelService,
  GetCustomLabelForFile,
  GetMaxWorkspaceFiles,
  ICustomEditorLabelPatterns,
  IsCustomLabelsEnabled,
} from "../../../helpers/customEditorLabelService";
import { FileQuickPickItem } from "../interface/IFileQuickPickItem";
import { FileScore } from "../../scoring";

export async function showFileListWithCustomLabels(): Promise<void> {
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
      customLabel: GetCustomLabelForFile(file) || vscode.workspace.asRelativePath(file),
    };
    internalFiles.push(fileObject);
  });

  const labelProcessEnd = performance.now();
  console.log(
    `2. Custom label processing: ${(labelProcessEnd - labelProcessStart).toFixed(2)}ms (${internalFiles.length} files)`
  );

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
      score: {} as FileScore,
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
    placeHolder: `Select file to open (showing first 50 of ${files.length} files) - Custom Labels ${
      IsCustomLabelsEnabled() ? "ENABLED" : "DISABLED"
    }`,
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
