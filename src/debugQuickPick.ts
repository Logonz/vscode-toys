import * as vscode from "vscode";
import { GetIconForFile, LoadIcons } from "./icons";
import { GetAllFilesInWorkspace } from "./files";
import { CustomEditorLabelService, GetMaxWorkspaceFiles, ICustomEditorLabelPatterns } from "./helpers/customEditorLabelService";

export interface FileQuickPickItem extends vscode.QuickPickItem {
  filePath: string;
  relativePath: string;
  rawScore: number;
  recencyScore: number;
  frequencyScore: number;
  closeScore: number;
  finalScore: number;
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
      label: "$(list-unordered) Show File List",
      description: "Display all workspace files with icons",
      action: "showFileList"
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
    case "showFileList":
      await showFileListWithIcons();
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

async function showFileListWithIcons(): Promise<void> {
  const files = await GetAllFilesInWorkspace();
  const items: FileQuickPickItem[] = [];

  for (const file of files.slice(0, 50)) {
    const icon = await GetIconForFile(file);
    const relativePath = vscode.workspace.asRelativePath(file);
    
    items.push({
      label: `$(file) ${relativePath}`,
      description: icon ? "Has icon" : "No icon",
      filePath: file.fsPath,
      relativePath: relativePath,
      rawScore: 0,
      recencyScore: 0,
      frequencyScore: 0,
      closeScore: 0,
      finalScore: 0
    });
  }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Select file to open (showing first 50 of ${files.length} files)`
  });

  if (picked) {
    const doc = await vscode.workspace.openTextDocument(picked.filePath);
    await vscode.window.showTextDocument(doc);
  }
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