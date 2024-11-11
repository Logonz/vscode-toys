// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { hasMatch, score } from "./fzy";
import path from "path";
import fs from "fs";
import ignore from "ignore";

import { GetIconForFile, LoadIcons } from "./icons";
import { getExtensionContext } from "../extension";
import {
  MAX_FREQUENCY_SCORE,
  getFileMetadata,
  // initializeMetadata,
  updateFileMetadata,
} from "./metadata";
import { calculateCompositeScore, calculateRecencyScore } from "./score";
import { CustomEditorLabelService, GetMaxWorkspaceFiles, ICustomEditorLabelPatterns } from "../helpers/customEditorLabelService";
import { printSmartOpenOutput } from "./main";

// Own interface extending QuickPickItem
export interface FileQuickPickItem extends vscode.QuickPickItem {
  filePath: string;
  relativePath: string;
  rawScore: number;
  recencyScore: number;
  frequencyScore: number;
  closeScore: number;
  finalScore: number;
}

const filesToIcon = new Map<string, vscode.Uri>();
// All files in the workspace
let files: vscode.Uri[] = [];

async function getAllFileIcons(files: vscode.Uri[]) {
  printSmartOpenOutput(`Getting all file icons count: ${files.length}`, false);
  const parsedFileExtensions: string[] = [];
  const extToIcon = new Map<string, vscode.Uri>();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // TODO: look this over in terms of performance
    // When you have TONS of files, this will be slow, use ~ to test
    const fileExtension = path.extname(file.fsPath).toLowerCase();
    if (parsedFileExtensions.includes(fileExtension)) {
      const icon = extToIcon.get(fileExtension);
      if (icon) {
        filesToIcon.set(file.fsPath, icon);
      }
      continue;
    }
    // GetIconForFile(vscode.Uri.file(file)).then((icon) => {
    const icon = await GetIconForFile(file); //.then((icon) => {
    if (icon) {
      filesToIcon.set(file.fsPath, icon);
      extToIcon.set(fileExtension, icon);
    }
    if (!parsedFileExtensions.includes(fileExtension)) {
      parsedFileExtensions.push(fileExtension);
    }
    // });
  }
}

function initalizeListener(context: vscode.ExtensionContext) {
  // File watchers
  const watcher = vscode.workspace.createFileSystemWatcher("**/*", false, false, false);

  // TODO: Make these just scan the current file and not all files
  const debouncedOnDidCreate = debounce(async (uri: vscode.Uri) => {
    printSmartOpenOutput(`On File Create : URI: ${uri}`);
    console.log(`On File Create : URI: ${uri}`);
    if (uri.path.includes("/.git/")) {
      return;
    }
    // initializeMetadata(DAcontext, uri.fsPath);
    files = await GetAllFilesInWorkspace();
    await getAllFileIcons(files);
  }, debounceDelay);

  // TODO: Make these just scan the current file and not all files
  // const debouncedOnDidChange = debounce(async (uri: vscode.Uri) => {
  //   printJumpOutput(`On File Change : URI: ${uri}`);
  //   getAllFileIcons(
  //     (await GetAllFilesInWorkspace()).map((file) => vscode.Uri.file(file))
  //   );
  // }, debounceDelay);

  // TODO: Make these just scan the current file and not all files
  const createD = watcher.onDidCreate(debouncedOnDidCreate);
  // watcher.onDidChange(debouncedOnDidChange);
  const deleteD = watcher.onDidDelete((uri) => {
    console.log(`On File Delete : URI: ${uri}`);
    if (uri.path.includes("/.git/")) {
      return;
    }
    // We use a timeout to make sure the file is deleted after the debounce delay
    setTimeout(() => {
      printSmartOpenOutput(`On File Delete : URI: ${uri}`);
      filesToIcon.delete(uri.fsPath);
    }, debounceDelay + 50);
  });

  context.subscriptions.push(createD);
  context.subscriptions.push(deleteD);
}

const quickPickObject = vscode.window.createQuickPick<FileQuickPickItem>();

export async function InitializeFind(context: vscode.ExtensionContext) {
  // * Load Icon pack
  LoadIcons();

  files = await GetAllFilesInWorkspace();

  // If the there are no metadata for the files initialize them
  // files.forEach((file) => {
  //   initializeMetadata(DAcontext, file);
  // });

  // * Get all files in the workspace
  await getAllFileIcons(files);

  // * Initialize the listener
  initalizeListener(context);

  // * Intialize the quick pick
  quickPickObject.placeholder = "Search files by name...";
  quickPickObject.matchOnDescription = false;
  quickPickObject.matchOnDetail = false;
  // quickPickObject.items = filteredItems;

  // Only a proposed API does not exist yet...
  // https://vscode.dev/github/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.quickPickSortByLabel.d.ts
  // https://github.com/microsoft/vscode/issues/73904
  (quickPickObject as any).sortByLabel = false;

  const QUICK_COMMANDS: Record<string, string> = {
    '>': 'workbench.action.showCommands', // If the user types >, show the command palette
    '%': 'workbench.action.quickTextSearch', // If the user types %, show quick text search
    '#': 'workbench.action.showAllSymbols', // If the user types #, go to symbol workspace
    '@': 'workbench.action.gotoSymbol', // If the user types @, go to symbol in file
    ':': 'workbench.action.gotoLine' // If the user types :, go to line
  };

  // * Update items as the user types
  const changeD = quickPickObject.onDidChangeValue(async (value: string) => {
    // If the user types a quick command, execute it
    if (QUICK_COMMANDS[value]) {
      quickPickObject.hide();
      vscode.commands.executeCommand(QUICK_COMMANDS[value]);
      return;
    }
    const scores = await GenerateItemList(value, files);

    quickPickObject.items = scores;
  });

  // * User accepts the selection
  const acceptD = quickPickObject.onDidAccept(async () => {
    const selectedItem = quickPickObject.selectedItems[0];
    // Disabled is used to show the message to use at least 2 characters
    if (selectedItem && selectedItem.relativePath !== "disabled") {
      const filePath = vscode.Uri.file(selectedItem.filePath);
      vscode.window.showTextDocument(filePath);

      // Update metadata
      await updateFileMetadata(getExtensionContext(), selectedItem.filePath);
    }
    quickPickObject.hide();
  });

  // * User hides the quick pick
  const hideD = quickPickObject.onDidHide(() => {
    // Reset the value
    quickPickObject.value = "";
  });

  context.subscriptions.push(changeD);
  context.subscriptions.push(acceptD);
  context.subscriptions.push(hideD);
}

export async function SpawnQuickPick() {
  const maxFiles = GetMaxWorkspaceFiles();
  console.log(files.length, maxFiles);
  if (files.length <= maxFiles) {
    quickPickObject.items = await GenerateItemList("", files);
  } else {
    quickPickObject.placeholder = "Too many files to parse";
    quickPickObject.items = [
      {
        label: "Please increase the maxWorkspaceFiles setting",
        description: `Files: ${files.length} <= ${maxFiles}`,
        filePath: "",
        relativePath: "disabled",
        iconPath: new vscode.ThemeIcon("warning"),
        rawScore: 0,
        recencyScore: 0,
        frequencyScore: 0,
        closeScore: 0,
        finalScore: 0,
      },
    ];
  }
  // Show the quick pick
  quickPickObject.show();
}

// Map a number from one range to another
/**
 * Maps a number from one range to another.
 * @param r1l - The lower bound of the first range.
 * @param r1h - The upper bound of the first range.
 * @param r2l - The lower bound of the second range.
 * @param r2h - The upper bound of the second range.
 * @param num - The number to be mapped from the first range to the second range.
 * @returns The number mapped from the first range to the second range.
 */
function mapNumberRange(r1l: number, r1h: number, r2l: number, r2h: number, num: number): number {
  const mappedValue = r2l + ((num - r1l) * (r2h - r2l)) / (r1h - r1l);
  return isNaN(mappedValue) ? 0 : mappedValue;
}

async function GenerateItemList(needle: string, files: vscode.Uri[]): Promise<FileQuickPickItem[]> {
  // ! Remove when proposed API is implemented.
  // https://vscode.dev/github/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.quickPickSortByLabel.d.ts
  // https://github.com/microsoft/vscode/issues/73904
  // Due to the bug that is sorting in quick pick, it basically only works either with 0 or 2 characters
  // TODO: When the bug is fixed and we can do our own sorting, we can remove this (https://github.com/microsoft/vscode/issues/73904)
  if (needle.length === 1) {
    return [
      {
        label: "Use at least 2 characters to search files...",
        description: "",
        filePath: "",
        relativePath: "disabled",
        iconPath: new vscode.ThemeIcon("search"),
        rawScore: 0,
        recencyScore: 0,
        frequencyScore: 0,
        closeScore: 0,
        finalScore: 0,
      },
    ];
  }
  // Split needle into characters
  const needleParts = needle.toLowerCase().split("");

  let internalFiles: { uri: vscode.Uri; customLabel: string; relativePath: string; fsPath: string }[] = [];
  // Check if custom labels are enabled
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
        let addFile = true;
        for (let i = 0; i < needleParts.length; i++) {
          const part = needleParts[i];
          if (!fileObject.customLabel.toLowerCase().includes(part)) {
            addFile = false;
            break;
          }
        }
        if (addFile) {
          // console.log("Adding file:", fileObject);
          internalFiles.push(fileObject);
        }
      });
    }
  } else {
    internalFiles = internalFiles.map((file) => {
      return file;
    });
  }
  console.log(internalFiles);

  const metadata = getFileMetadata(getExtensionContext());
  const currentTime = Date.now();

  const currentActiveEditor = vscode.window.activeTextEditor;

  const activeEditorPathParts = vscode.workspace
    .asRelativePath(currentActiveEditor?.document.uri.fsPath || "")
    .split("/");
  // console.log(activeEditorPathParts);
  printSmartOpenOutput(`Number of parts of active: ${activeEditorPathParts?.length}`, false);

  // First, compute the scores for all files
  const fileScores = internalFiles.map((file): FileQuickPickItem => {
    // const relativePath = vscode.workspace.asRelativePath(file);
    const rawScore = score(needle, file.customLabel);

    const fileMeta = metadata[file.fsPath];
    const lastOpened = fileMeta ? fileMeta.lastOpened : 0;
    const openCount = fileMeta ? fileMeta.openCount : 0;

    // Calculate the close score based on path overlap with the active editor
    let closeScore = 0;
    const fileParts = vscode.workspace.asRelativePath(file.uri).split("/");
    const commonParts = fileParts.filter((part) => activeEditorPathParts.includes(part));
    const uncommonParts = fileParts.filter((part) => !activeEditorPathParts.includes(part));

    // TODO: Should we subtract the common parts from the total parts?
    closeScore = Math.max(0, commonParts.length - uncommonParts.length);
    return {
      label: file.customLabel,
      filePath: file.fsPath,
      relativePath: file.relativePath,
      rawScore: rawScore,
      recencyScore: Math.round(calculateRecencyScore(lastOpened, currentTime)),
      frequencyScore: openCount,
      closeScore: closeScore,
      finalScore: 0,
    };
  });
  const minScore = Math.min(...fileScores.map((fs) => (fs.rawScore === Number.NEGATIVE_INFINITY ? 0 : fs.rawScore)));
  const maxScore = Math.max(...fileScores.map((fs) => (fs.rawScore === Number.POSITIVE_INFINITY ? 0 : fs.rawScore)));
  const minRecencyScore = Math.min(...fileScores.map((fs) => fs.recencyScore));
  const maxRecencyScore = Math.max(...fileScores.map((fs) => fs.recencyScore));

  // const maxScoreValue = Math.round(maxScore - minScore);
  // const minLength = Math.ceil(Math.log(maxScoreValue + 1) / Math.log(base));

  // printJumpOutput(`Min score:, ${minScore}`, true);
  // printJumpOutput(`Max score:, ${maxScore}`, true);
  // printJumpOutput(`Max score value:, ${maxScoreValue}`, true);
  // printJumpOutput(`Min length:, ${minLength}`, true);

  const scoreWeights = {
    matchQuality: 0.5,
    recency: 0.3,
    frequency: 0.2,
    close: 0.1,
  };
  const filteredItems = (
    await Promise.all(
      fileScores
        .filter((fs) => hasMatch(needle, fs.relativePath))
        .map(async (fs): Promise<FileQuickPickItem> => {
          const fileMeta = metadata[fs.filePath];
          // const lastOpened = fileMeta ? fileMeta.lastOpened : 0;
          const openCount = fileMeta ? fileMeta.openCount : 0;

          // console.log(fs);

          const recencyScoreMapped = mapNumberRange(
            minRecencyScore,
            maxRecencyScore,
            minScore,
            maxScore === 0 ? 100 : maxScore, // If nothing is matched we still want score for recency
            fs.recencyScore
          );
          const frequencyScoreMapped = mapNumberRange(
            0,
            MAX_FREQUENCY_SCORE,
            minScore,
            maxScore === 0 ? MAX_FREQUENCY_SCORE : maxScore, // If nothing is matched we still want score for frequency
            openCount
          );
          const closeScoreMapped = mapNumberRange(
            0,
            activeEditorPathParts.length,
            minScore,
            maxScore === 0 ? 100 : maxScore, // If nothing is matched we still want score for closeness
            fs.closeScore
          );
          let finalScore = calculateCompositeScore(
            isNaN(fs.rawScore) ? 0 : fs.rawScore,
            isNaN(recencyScoreMapped) ? 0 : recencyScoreMapped,
            isNaN(frequencyScoreMapped) ? 0 : frequencyScoreMapped,
            isNaN(closeScoreMapped) ? 0 : closeScoreMapped,
            scoreWeights
          );
          if (fs.filePath === currentActiveEditor?.document.uri.fsPath) {
            // Penalize the current file by 10%
            finalScore = finalScore * 0.9;
          }
          // printJumpOutput(`File: ${fs.relativePath}`, true);
          // printJumpOutput(`Open count: ${openCount}`, true);
          // printJumpOutput(`Recency Mapped: ${recencyScoreMapped}`, true);
          // printJumpOutput(`Frequency Mapped: ${frequencyScoreMapped}`, true);
          // printJumpOutput(`Final Score: ${finalScore}`, true);

          let descriptions: string[] = [];
          descriptions.push(`${fs.relativePath} - (fnl:${finalScore.toFixed(2)})=`);
          descriptions.push(`(raw:${(fs.rawScore * scoreWeights.matchQuality).toFixed(2)})`);
          descriptions.push(`(rec:${(recencyScoreMapped * scoreWeights.recency).toFixed(2)})`);
          descriptions.push(`(frq:${(frequencyScoreMapped * scoreWeights.frequency).toFixed(2)})`);
          descriptions.push(`(cls:${(closeScoreMapped * scoreWeights.close).toFixed(2)})`);

          const description = descriptions
            .map((desc) => {
              if (!desc.includes(":0.00)") && !desc.includes(":0)")) {
                return desc;
              }
            })
            .join("");

          return {
            label: fs.label,
            description: description,
            filePath: fs.filePath,
            relativePath: fs.relativePath,
            iconPath: filesToIcon.get(fs.filePath) || new vscode.ThemeIcon("file"), // Apply the icon as needed
            rawScore: fs.rawScore,
            recencyScore: recencyScoreMapped,
            frequencyScore: frequencyScoreMapped,
            closeScore: closeScoreMapped,
            finalScore: finalScore,
          };
        })
    )
  )
    // .sort((a, b) => b.rawScore - a.rawScore)
    .sort((a, b) => b.finalScore - a.finalScore)
    // Map to QuickPick items
    .map(
      (item): FileQuickPickItem => ({
        label: item.label,
        description: item.description,
        filePath: item.filePath,
        relativePath: item.relativePath,
        iconPath: item.iconPath,
        rawScore: item.rawScore,
        recencyScore: item.recencyScore,
        frequencyScore: item.frequencyScore,
        closeScore: item.closeScore,
        finalScore: item.finalScore,
      })
    );

  // ! Remove when proposed API is implemented.
  // https://vscode.dev/github/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.quickPickSortByLabel.d.ts
  // https://github.com/microsoft/vscode/issues/73904
  // if((quickPickObject as any).sortByLabel !== false) {
  const maxLength = filteredItems.length.toString().length;
  for (let i = 0; i < filteredItems.length; i++) {
    const item = filteredItems[i];
    const length = i.toString().length;

    if (length < maxLength) {
      const diff = maxLength - length;
      const spaces = "1".repeat(diff);
      filteredItems[i].label = `${spaces}${i} ${item.label}`;
    } else {
      filteredItems[i].label = `${i} ${item.label}`;
    }
  }
  // }

  return filteredItems;
}

function loadGitignore(folderPath: string): ReturnType<typeof ignore> {
  const ig = ignore();
  const gitignorePath = path.join(folderPath, ".gitignore");

  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
    ig.add(gitignoreContent);
  }

  return ig;
}

function passesGitignoreCheck(filePath: string, folderPath: string, ig: ReturnType<typeof ignore> | undefined): boolean {
  if (ig === undefined) {
    ig = loadGitignore(folderPath);
  }
  const relativePath = path.relative(folderPath, filePath);
  return !ig.ignores(relativePath);
}

export async function GetAllFilesInWorkspace(): Promise<vscode.Uri[]> {
  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showInformationMessage("No workspace is open.");
    return [];
  }

  const allFiles: vscode.Uri[] = [];

  for (const workspaceFolder of vscode.workspace.workspaceFolders) {
    const folderPath = workspaceFolder.uri.fsPath;
    const pattern = new vscode.RelativePattern(folderPath, "**/*");
    const ig = loadGitignore(folderPath);

    const files = await vscode.workspace.findFiles(pattern);
    files.forEach((file) => {
      if (passesGitignoreCheck(file.fsPath, folderPath, ig)) {
        allFiles.push(file);
      }
    });
  }

  return allFiles;
}

// const charset = '<>:"/\\|?*'; // Valid characters for encoding
// const base = charset.length; // Base is the length of charset

// const charset =
//   "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// const base = charset.length; // 62

// const charset =
//   "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// const base = charset.length; // 62

// const charset = "0123456789";
// 123456789
const charset = "0123456789";
// const charset = "¹²³⁴⁵⁶⁷⁸⁹";
// const charset = '¹²³⁰⁴⁵⁶⁷⁸⁹';
// const charset = 'ʰʲᵃᵇᵈᵉᵍᵏᶜᶠ';
const base = charset.length; // 62

function encodeScore(num: number, minLength: number): string {
  console.log(num, minLength);
  // Ensure num is non-negative and base is valid
  if (num < 0) {
    throw new Error("encodeScore received a negative number");
  }

  if (base <= 0) {
    throw new Error("Base must be greater than 0");
  }

  let encoded = "";

  // Loop to encode the number in the given base
  do {
    const remainder = num % base;

    // Ensure remainder is a valid index in the charset
    if (remainder < 0 || remainder >= base) {
      throw new RangeError(`Invalid remainder value: ${remainder}`);
    }
    // Check for very large numbers causing runaway loops
    if (encoded.length > 1000) {
      console.log(encoded);
      throw new RangeError("Encoded string length exceeded 1000 characters.");
    }
    console.log(remainder, charset[remainder]);
    encoded = charset[remainder] + encoded;
    num = Math.floor(num / base);
  } while (num > 0);

  // Pad with the first character ('<') to ensure consistent length
  while (encoded.length < minLength) {
    encoded = charset[0] + encoded; // Pad with the first character of charset
  }

  return encoded;
}

const debounceDelay = 150;
function debounce(func: Function, delay: number) {
  let timeoutId: NodeJS.Timeout;
  let uriList: vscode.Uri[] = [];

  return function (uri: vscode.Uri) {
    uriList.push(uri);
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(uriList);
      uriList = [];
    }, delay);
  };
}

async function getAllTextDocumentsInWorkspace(): Promise<vscode.TextDocument[]> {
  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showInformationMessage("No workspace is open.");
    return [];
  }

  const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const pattern = new vscode.RelativePattern(workspaceFolder, "**/*");

  const files = await vscode.workspace.findFiles(pattern, "**/node_modules/**");
  const allFiles: vscode.TextDocument[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      allFiles.push(await vscode.workspace.openTextDocument(file));
    } catch (error) {
      console.error(`Error opening file: ${error}`);
    }
  }
  return allFiles;
}
