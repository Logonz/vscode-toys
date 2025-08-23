import * as vscode from "vscode";
import { GetIconForFile, LoadIcons, batchLoadIcons, getIconCacheStats, clearIconCache } from "../icons";
import { GetAllFilesInWorkspace } from "../files";
import { CustomEditorLabelService, GetCustomLabelForFile, GetMaxWorkspaceFiles, ICustomEditorLabelPatterns, IsCustomLabelsEnabled } from "../../helpers/customEditorLabelService";
import { FileQuickPickItem } from "./FileQuickPickItem";
import { UriExt } from "./UriExt";
import { encodeScore } from "./encodeScore";



export async function showFileListWithFuzzy(): Promise<void> {
  const totalStart = performance.now();

  console.log("=== Performance Profile: showFileListWithFuzzy ===");

  const fileLoadStart = performance.now();
  const files = await GetAllFilesInWorkspace();
  const fileLoadEnd = performance.now();
  console.log(`1. File loading: ${(fileLoadEnd - fileLoadStart).toFixed(2)}ms (${files.length} files)`);

  // Batch load icons for all files
  await batchLoadIcons(files);

  // Custom label processing using cached configuration
  const labelProcessStart = performance.now();
  let internalFiles: UriExt[] = [];

  // Use cached configuration instead of reading from workspace every time
  files.forEach((file) => {
    const fileObject: UriExt = {
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

  items
    .sort((a, b) => b.label.length - a.label.length)
    // Map to QuickPick items
    .map(
      (item): FileQuickPickItem => ({
        label: item.label,
        description: item.description,
        file: item.file,
        iconPath: item.iconPath,
      })
    );

  // ! Remove when proposed API is implemented.
  // https://vscode.dev/github/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.quickPickSortByLabel.d.ts
  // https://github.com/microsoft/vscode/issues/73904
  // if((quickPickObject as any).sortByLabel !== false) {
  const maxLength = items.length.toString().length;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const length = i.toString().length;

    if (length < maxLength) {
      const diff = maxLength - length;
      // const spaces = "1".repeat(diff);
      // const spaces = "\u00A0".repeat(diff);
      const spaces = encodeScore(i, maxLength);

      items[i].label = `${spaces}${i} ${item.label}`;
    } else {
      items[i].label = `${i} ${item.label}`;
    }
  }


  const iconLoadEnd = performance.now();
  console.log(`3. Icon loading: ${(iconLoadEnd - iconLoadStart).toFixed(2)}ms (${files.length} files)`);
  console.log(`   Average per file: ${((iconLoadEnd - iconLoadStart) / files.length).toFixed(2)}ms`);

  const quickPickStart = performance.now();
  const picked = await vscode.window.showQuickPick(items, {
    matchOnDescription: false,
    matchOnDetail: false,
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