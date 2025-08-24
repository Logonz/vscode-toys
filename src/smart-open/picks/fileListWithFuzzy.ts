import * as vscode from "vscode";
import { GetIconForFile, LoadIcons, batchLoadIcons, getIconCacheStats, clearIconCache } from "../icons";
import { GetAllFilesInWorkspace } from "../files";
import { CustomEditorLabelService, GetCustomLabelForFile, GetMaxWorkspaceFiles, ICustomEditorLabelPatterns, IsCustomLabelsEnabled } from "../../helpers/customEditorLabelService";
import { FileQuickPickItem } from "./FileQuickPickItem";
import { UriExt } from "./UriExt";
import { encodeScore } from "./encodeScore";
import { InlineInput } from "./InlineInput";
// import { SmartOpenInlineInput } from "./SmartOpenInlineInput";



const picked = vscode.window.createQuickPick<FileQuickPickItem>();
picked.matchOnDescription = false;
picked.matchOnDetail = false;
// picked.enabled = false;
picked.ignoreFocusOut = true;
picked.totalSteps = 5;
picked.placeholder = `Select file to open - Custom Labels ${IsCustomLabelsEnabled() ? 'ENABLED' : 'DISABLED'}`;

picked.onDidChangeValue(showFileListWithFuzzy);
picked.onDidChangeValue((value) => {
  console.log("Input changed:", value);
  picked.value = "";
  const activeEditor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0];
  vscode.window.showTextDocument(activeEditor.document);
});

export async function showFileListWithFuzzy(input: string): Promise<void> {
  const totalStart = performance.now();

  console.log("=== Performance Profile: showFileListWithFuzzy ===");

  const fileLoadStart = performance.now();
  const files = await GetAllFilesInWorkspace(input);
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

  const sortedItems = items
    .sort((a, b) => b.label.length - a.label.length)
    // Map to QuickPick items
    .map(
      (item): FileQuickPickItem => ({
        label: `${item.label}`,
        description: `(${item.label.length}) ${item.description}`,
        file: item.file,
        iconPath: item.iconPath,
      })
    );



  const iconLoadEnd = performance.now();
  console.log(`3. Icon loading: ${(iconLoadEnd - iconLoadStart).toFixed(2)}ms (${files.length} files)`);
  console.log(`   Average per file: ${((iconLoadEnd - iconLoadStart) / files.length).toFixed(2)}ms`);

  // ! Remove when proposed API is implemented.
  // https://vscode.dev/github/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.quickPickSortByLabel.d.ts
  // https://github.com/microsoft/vscode/issues/73904
  // if((quickPickObject as any).sortByLabel !== false) {
  const maxLength = sortedItems.length.toString().length;
  for (let i = 0; i < sortedItems.length; i++) {
    const item = sortedItems[i];
    const length = i.toString().length;

    if (length < maxLength) {
      const diff = maxLength - length;
      // const spaces = "1".repeat(diff);
      const spaces = "\u00A0".repeat(diff);

      sortedItems[i].label = `${spaces} ${item.label}`;
      // sortedItems[i].label = `${spaces}${i} ${item.label}`;
    } else {
      sortedItems[i].label = ` ${item.label}`;
      // sortedItems[i].label = `${i} ${item.label}`;
    }
  }

  const activeEditor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0];
  const quickPickStart = performance.now();
  picked.items = sortedItems;
  picked.show();
  vscode.window.showTextDocument(activeEditor.document);
  const quickPickEnd = performance.now();
  console.log(`4. QuickPick display: ${(quickPickEnd - quickPickStart).toFixed(2)}ms`);

  // if (picked) {
  //   const openStart = performance.now();
  //   const doc = await vscode.workspace.openTextDocument(picked.file);
  //   await vscode.window.showTextDocument(doc);
  //   const openEnd = performance.now();
  //   console.log(`5. File opening: ${(openEnd - openStart).toFixed(2)}ms`);
  // }

  const totalEnd = performance.now();
  console.log(`=== Total time: ${(totalEnd - totalStart).toFixed(2)}ms ===`);

  const stats = getIconCacheStats();
  console.log(`Icon cache stats: ${stats.hits} hits, ${stats.extensionHits} ext hits, ${stats.misses} misses`);
  console.log(`Custom labels enabled: ${IsCustomLabelsEnabled()}, processed ${internalFiles.length} files`);
}

export async function showQuickPickWithInlineSearch(): Promise<void> {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showErrorMessage("No active editor found");
    return;
  }

  // Set context to enable search keybindings
  await vscode.commands.executeCommand("setContext", "vstoys.smart-open.searching", true);

  // Start with empty search to show all files
  await showFileListWithFuzzy("");

  let inlineInput: InlineInput | undefined;
  let selectedIndex = 0;

  // Update QuickPick selection
  const updateSelection = () => {
    if (picked.items.length > 0) {
      selectedIndex = Math.max(0, Math.min(selectedIndex, picked.items.length - 1));
      picked.activeItems = [picked.items[selectedIndex]];

      if (inlineInput) {
        const itemCount = picked.items.length;
        inlineInput.updateStatusBar(
          `Search: ${inlineInput.input} [${selectedIndex + 1}/${itemCount}]`,
          true
        );

        picked.placeholder = `Search: ${inlineInput.input} [${selectedIndex + 1}/${itemCount}]`;
      }
    }
  };

  try {
    inlineInput = new InlineInput({
      textEditor: activeEditor,
      onInput: async (input: string, char: string) => {
        console.log(`Received input: "${input}", char: "${char}"`);

        // Handle special characters for navigation
        if (char === "ArrowUp" || char === "ArrowDown") {
          if (char === "ArrowUp" && selectedIndex > 0) {
            selectedIndex--;
          } else if (char === "ArrowDown" && selectedIndex < picked.items.length - 1) {
            selectedIndex++;
          }
          updateSelection();
          return; // Don't process as search input
        }

        // Reset selection when search changes
        selectedIndex = 0;

        // Update the QuickPick with filtered results
        await showFileListWithFuzzy(input);

        // Update selection after items change
        updateSelection();
      },
      onCancel: async () => {
        await vscode.commands.executeCommand("setContext", "vstoys.smart-open.searching", false);
        picked.hide();
        if (inlineInput) {
          inlineInput.destroy();
        }
      }
    });

    // Register arrow key commands
    const upCommand = vscode.commands.registerCommand("vstoys.smart-open.navigateUp", () => {
      if (selectedIndex > 0) {
        selectedIndex--;
        updateSelection();
      }
    });

    const downCommand = vscode.commands.registerCommand("vstoys.smart-open.navigateDown", () => {
      if (selectedIndex < picked.items.length - 1) {
        selectedIndex++;
        updateSelection();
      }
    });

    const enterCommand = vscode.commands.registerCommand("vstoys.smart-open.selectFile", async () => {
      const selectedItem = picked.items[selectedIndex];
      if (selectedItem) {
        await vscode.commands.executeCommand("setContext", "vstoys.smart-open.searching", false);
        await openFile(selectedItem.file);
        picked.hide();
        if (inlineInput) {
          inlineInput.destroy();
        }
      }
    });

    const backspaceCommand = vscode.commands.registerCommand("vstoys.smart-open.deleteChar", () => {
      if (inlineInput) {
        const newInput = inlineInput.deleteLastCharacter();
        // Trigger search with new input
        showFileListWithFuzzy(newInput).then(() => {
          selectedIndex = 0;
          updateSelection();
        });
      }
    });

    // Handle selection from QuickPick
    const disposableAccept = picked.onDidAccept(async () => {
      const selectedItem = picked.selectedItems[0] || picked.items[selectedIndex];
      if (selectedItem) {
        await vscode.commands.executeCommand("setContext", "vstoys.smart-open.searching", false);
        await openFile(selectedItem.file);
        picked.hide();
        if (inlineInput) {
          inlineInput.destroy();
        }
      }
    });

    // Handle QuickPick hide
    const disposableHide = picked.onDidHide(async () => {
      await vscode.commands.executeCommand("setContext", "vstoys.smart-open.searching", false);
      if (inlineInput) {
        inlineInput.destroy();
      }
      upCommand.dispose();
      downCommand.dispose();
      enterCommand.dispose();
      backspaceCommand.dispose();
      disposableAccept.dispose();
      disposableHide.dispose();
    });

    // Set initial selection
    updateSelection();

    // Initialize status bar
    inlineInput.updateStatusBar("Search files...", true);

  } catch (error) {
    vscode.window.showErrorMessage(`Failed to start inline search: ${error}`);
    await vscode.commands.executeCommand("setContext", "vstoys.smart-open.searching", false);
    if (inlineInput) {
      inlineInput.destroy();
    }
  }
}

async function openFile(uri: vscode.Uri): Promise<void> {
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open file: ${error}`);
  }
}