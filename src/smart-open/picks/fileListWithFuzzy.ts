import * as vscode from "vscode";
import { GetIconForFile, LoadIcons, batchLoadIcons, getIconCacheStats, clearIconCache } from "../icons";
import { GetAllFilesInWorkspace } from "../files";
import { GetCustomLabelForFile, IsCustomLabelsEnabled } from "../../helpers/customEditorLabelService";
import { FileQuickPickItem } from "./interface/IFileQuickPickItem";
import { UriExt } from "./interface/IUriExt";
import { InlineInput } from "./InlineInput";
import { DEFAULT_SCORE_CONFIG, GitScorer } from "../scoring";
import { scoreCalculator } from "../main";
import path from "path";

// Module-level reference to active InlineInput for forwarding QuickPick input
let activeInlineInput: InlineInput | undefined;

let filesCache: vscode.Uri[] = [];

// Debounce timer for file/icon loading
let fileLoadDebounceTimer: NodeJS.Timeout | undefined;

// Switch editor or file listener
vscode.window.onDidChangeActiveTextEditor(async (editor) => {
  console.log("Active editor changed:", editor?.document.uri);
  if (DEFAULT_SCORE_CONFIG.enabled.git) {
    if (editor?.document) {
      // The active file
      const fileObject: UriExt = {
        uri: editor.document.uri,
        fsPath: editor.document.uri.fsPath,
        fileName: path.basename(editor.document.uri.fsPath),
        relativePath: vscode.workspace.asRelativePath(editor.document.uri),
        customLabel: "",
      };

      const activeWorkspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      const context = { activeEditor: editor, activeWorkspaceFolder };
      // Re-evaluate the scoring when the active editor changes
      scoreCalculator.getScorer<GitScorer>("git")?.calculateScore("", fileObject, context);
    }
  }

  // Clear existing debounce timer
  if (fileLoadDebounceTimer) {
    clearTimeout(fileLoadDebounceTimer);
  }

  // Debounce file and icon loading
  fileLoadDebounceTimer = setTimeout(() => {
    // TODO: Use a real file watcher here instead of doing it each time we change active editor
    const fileLoadStart = performance.now();
    GetAllFilesInWorkspace().then((files) => {
      filesCache = files;
      const fileLoadEnd = performance.now();
      console.log(`  File loading: ${(fileLoadEnd - fileLoadStart).toFixed(2)}ms (${filesCache.length} files)`);

      // TODO: Use a real file watcher here instead of doing it each time we change active editor
      const iconLoadStart = performance.now();
      batchLoadIcons(filesCache).then(() => {
        const iconLoadEnd = performance.now();
        console.log(`  Icon loading: ${(iconLoadEnd - iconLoadStart).toFixed(2)}ms (${filesCache.length} files)`);
      });
    });
  }, 200); // 200ms debounce delay
});

const picked = vscode.window.createQuickPick<FileQuickPickItem>();
picked.matchOnDescription = false;
picked.matchOnDetail = false;
// picked.enabled = false; // This works and is good, but it disables mouse interactions
picked.ignoreFocusOut = true;
picked.title = "Smart Open";
picked.placeholder = `Select file to open - Custom Labels ${IsCustomLabelsEnabled() ? "ENABLED" : "DISABLED"}`;

picked.onDidChangeValue((value) => {
  console.log("Input changed:", value);

  // Forward input to active InlineInput if available and value has content
  if (value.length > 0 && activeInlineInput) {
    activeInlineInput.handleDirectInput(value);
  }

  picked.value = "";
  const activeEditor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0];
  vscode.window.showTextDocument(activeEditor.document);
});

export async function showFileListWithFuzzy(input: string): Promise<void> {
  const totalStart = performance.now();

  console.log("=== Performance Profile: showFileListWithFuzzy ===");

  // Get the currently active editor for context-aware scoring
  const activeEditor = vscode.window.activeTextEditor;
  const activeFilePath = activeEditor?.document.uri.fsPath;

  const activeWorkspaceFolder = activeEditor
    ? vscode.workspace.getWorkspaceFolder(activeEditor.document.uri)
    : undefined;

  const fileLoadStart = performance.now();
  // const files = await GetAllFilesInWorkspace();
  const files: vscode.Uri[] = filesCache.length > 0 ? filesCache : await GetAllFilesInWorkspace();
  const fileLoadEnd = performance.now();
  console.log(`1. File loading: ${(fileLoadEnd - fileLoadStart).toFixed(2)}ms (${files.length} files)`);

  // Batch load icons for all files
  const iconLoadStart = performance.now();
  await batchLoadIcons(files);
  const iconLoadEnd = performance.now();
  console.log(`2. Icon loading: ${(iconLoadEnd - iconLoadStart).toFixed(2)}ms (${files.length} files)`);
  console.log(`   Icon: Average per file: ${((iconLoadEnd - iconLoadStart) / files.length).toFixed(2)}ms`);

  // Custom label processing using cached configuration
  let internalFiles: UriExt[] = [];

  // Profiling variables
  const totalProcessingStart = performance.now();
  let totalLabelProcessingTime = 0;
  let totalFilterProcessingTime = 0;

  // Use cached configuration instead of reading from workspace every time
  files.forEach((file) => {
    // Filter the files by the input, we want to filter by custom labels.
    const labelProcessStart = performance.now();
    const customLabel = GetCustomLabelForFile(file);
    const labelProcessEnd = performance.now();
    totalLabelProcessingTime += labelProcessEnd - labelProcessStart;

    const relativePath = vscode.workspace.asRelativePath(file);

    // Quick check if the file should even be included.
    const filterProcessingStart = performance.now();

    if (input && input.includes(" ")) {
      const parts = input.split(/\s+/);
      // Check if the custom label contains all parts of the input
      const matches = parts.every((part) => (customLabel || relativePath).toLowerCase().includes(part.toLowerCase()));
      if (!matches) {
        // ? Profiling
        const filterProcessingEnd = performance.now();
        totalFilterProcessingTime += filterProcessingEnd - filterProcessingStart;
        // ?-Profiling
        return; // Skip files that don't match the input
      }
    } else if (input && !(customLabel || relativePath).toLocaleLowerCase().includes(input.toLocaleLowerCase())) {
      // ? Profiling
      const filterProcessingEnd = performance.now();
      totalFilterProcessingTime += filterProcessingEnd - filterProcessingStart;
      return;
      // ?-Profiling
    }
    // Add profiling for filter processing time
    const filterProcessingEnd = performance.now();
    totalFilterProcessingTime += filterProcessingEnd - filterProcessingStart;

    const fileObject: UriExt = {
      uri: file,
      fsPath: file.fsPath,
      fileName: path.basename(file.fsPath),
      relativePath: relativePath,
      customLabel: customLabel,
    };
    internalFiles.push(fileObject);
  });

  const totalProcessingEnd = performance.now();
  console.log(
    `3. UriExt Creation: ${(totalProcessingEnd - totalProcessingStart).toFixed(2)}ms (${internalFiles.length} files)`
  );
  console.log(`   CustomLabel: ${totalLabelProcessingTime.toFixed(2)}ms`);
  console.log(`   Filter: ${totalFilterProcessingTime.toFixed(2)}ms`);

  const items: FileQuickPickItem[] = [];

  const context = activeEditor ? { activeEditor, activeWorkspaceFolder } : undefined;

  const fileProcessingStart = performance.now();
  for (let i = 0; i < internalFiles.length; i++) {
    const fileInfo = internalFiles[i];

    // Do not include the current file in the suggestions
    // if (activeFilePath && fileInfo.fsPath === activeFilePath) {
    //   continue;
    // }

    // Get the precached icons
    const icon = await GetIconForFile(fileInfo.uri);

    // Calculate comprehensive score using the new scoring system
    const fileScore = scoreCalculator.calculateScore(input, fileInfo, context);

    // Skip files that are marked as hidden by scorers
    if (fileScore === null) {
      continue;
    }

    const pathWithoutFilename = vscode.workspace.asRelativePath(fileInfo.uri).replace(/\/[^\/]+$/, "");

    items.push({
      label: fileInfo.customLabel || fileInfo.fileName,
      description: pathWithoutFilename,
      detail: pathWithoutFilename,
      file: fileInfo.uri,
      iconPath: icon ? icon : new vscode.ThemeIcon("file"),
      score: fileScore, // Store the complete score object
    });

    if (i % 100 === 0) {
      console.log(`  - Processed ${i + 1}/${internalFiles.length} files`);
    }
  }
  console.log(`  - Processed ${internalFiles.length}/${internalFiles.length} files`);

  const fileProcessingEnd = performance.now();
  console.log(
    `4. File processing: ${(fileProcessingEnd - fileProcessingStart).toFixed(2)}ms (${internalFiles.length} files)`
  );

  const normalizeStart = performance.now();
  const normalizedItems = scoreCalculator.normalizeScores(items);
  const normalizeEnd = performance.now();
  console.log(`5. Score normalization: ${(normalizeEnd - normalizeStart).toFixed(2)}ms`);

  const sortingStart = performance.now();
  // Sort by final score (or fallback to fuzzy score), then by filename length, lastly by path
  // This is to avoid jumping lines in different cases
  const sortedItems = normalizedItems.sort((a, b) => {
    const scoreDiff = b.score.finalScore - a.score.finalScore;
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    // If scores are equal, sort by filename length (shorter first)
    const lengthDiff = a.file.path.length - b.file.path.length;
    if (lengthDiff !== 0) {
      return lengthDiff;
    }

    // Finally, sort alphabetically by path
    return a.file.path.localeCompare(b.file.path);
  });
  const sortingEnd = performance.now();
  console.log(`6. Sorting: ${(sortingEnd - sortingStart).toFixed(2)}ms`);

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

      sortedItems[i].label = `${spaces}${item.label}`;
      // sortedItems[i].label = `${spaces}${i} ${item.label}`;
    } else {
      sortedItems[i].label = `\u00A0${item.label}`;
      // sortedItems[i].label = `${i} ${item.label}`;
    }
  }

  const activeEditorForQuickPick = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0];
  const quickPickStart = performance.now();
  picked.items = sortedItems;
  picked.show();
  vscode.window.showTextDocument(activeEditorForQuickPick.document);
  const quickPickEnd = performance.now();
  console.log(`4. QuickPick display: ${(quickPickEnd - quickPickStart).toFixed(2)}ms`);

  const totalEnd = performance.now();
  console.log(`=== Total time: ${(totalEnd - totalStart).toFixed(2)}ms ===`);

  const stats = getIconCacheStats();
  console.log(
    `Icon cache stats: ${stats.hits} hits, ${stats.extensionHits} ext hits, ${stats.misses} misses, ${stats.quickExits} quick exits`
  );
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

  let selectedIndex = 0;

  // Update QuickPick selection
  const updateSelection = () => {
    if (picked.items.length > 0) {
      selectedIndex = Math.max(0, Math.min(selectedIndex, picked.items.length - 1));
      picked.activeItems = [picked.items[selectedIndex]];

      if (activeInlineInput) {
        const itemCount = picked.items.length;
        activeInlineInput.updateStatusBar(
          `Search: ${activeInlineInput.input} [${selectedIndex + 1}/${itemCount}]`,
          true
        );

        picked.placeholder = `Search: ${activeInlineInput.input} [${selectedIndex + 1}/${itemCount}]`;
      }
    } else {
      // No found items
      if (activeInlineInput) {
        picked.placeholder = `Search: ${activeInlineInput.input} [0/0]`;
      } else {
        picked.placeholder = `Search: [0/0] (No InlineInput)`;
      }
    }
  };

  try {
    activeInlineInput = new InlineInput({
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
        if (activeInlineInput) {
          activeInlineInput.destroy();
        }
        activeInlineInput = undefined; // Clear the reference
      },
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
        picked.hide();
        openFile(selectedItem.file);
        if (activeInlineInput) {
          activeInlineInput.destroy();
        }
        activeInlineInput = undefined; // Clear the reference
      }
    });

    const backspaceCommand = vscode.commands.registerCommand("vstoys.smart-open.deleteChar", () => {
      if (activeInlineInput) {
        const newInput = activeInlineInput.deleteLastCharacter();
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
        picked.hide();
        openFile(selectedItem.file);
        if (activeInlineInput) {
          activeInlineInput.destroy();
        }
        activeInlineInput = undefined; // Clear the reference
      }
    });

    // Handle QuickPick hide
    const disposableHide = picked.onDidHide(async () => {
      await vscode.commands.executeCommand("setContext", "vstoys.smart-open.searching", false);
      if (activeInlineInput) {
        activeInlineInput.destroy();
      }
      activeInlineInput = undefined; // Clear the reference
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
    activeInlineInput.updateStatusBar("Search files...", true);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to start inline search: ${error}`);
    await vscode.commands.executeCommand("setContext", "vstoys.smart-open.searching", false);
    if (activeInlineInput) {
      activeInlineInput.destroy();
    }
    activeInlineInput = undefined; // Clear the reference
  }
}

async function openFile(uri: vscode.Uri): Promise<void> {
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);

    // File opening is already tracked by RecencyScorer via onDidChangeActiveTextEditor
    // No need to manually record here anymore
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open file: ${error}`);
  }
}
