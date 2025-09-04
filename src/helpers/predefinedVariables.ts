import * as vscode from "vscode";
import path from "path";
import os from "os";

// https://code.visualstudio.com/docs/reference/variables-reference

// Predefined variables reference:
// ${userHome} 	Path of the user's home folder
// ${workspaceFolder} 	Path of the folder opened in VS Code
// ${workspaceFolderBasename} 	Name of the folder opened in VS Code without any slashes (/)
// ${file} 	Currently opened file
// ${fileWorkspaceFolder} 	Currently opened file's workspace folder
// ${relativeFile} 	Currently opened file relative to workspaceFolder
// ${relativeFileDirname} 	Currently opened file's dirname relative to workspaceFolder
// ${fileBasename} 	Currently opened file's basename
// ${fileBasenameNoExtension} 	Currently opened file's basename with no file extension
// ${fileExtname} 	Currently opened file's extension
// ${fileDirname} 	Currently opened file's folder path
// ${fileDirnameBasename} 	Currently opened file's folder name
// ${lineNumber} 	Currently selected line number in the active file
// ${columnNumber} 	Currently selected column number in the active file
// ${selectedText} 	Currently selected text in the active file
// ${pathSeparator} 	Character used by the operating system to separate components in file paths
// ${/} 	Shorthand for ${pathSeparator}
// ${file} 	Currently opened file
// ${fileWorkspaceFolder} 	Currently opened file's workspace folder
// ${relativeFile} 	Currently opened file relative to workspaceFolder
// ${relativeFileDirname} 	Currently opened file's dirname relative to workspaceFolder
// ${fileBasename} 	Currently opened file's basename
// ${fileBasenameNoExtension} 	Currently opened file's basename with no file extension
// ${fileExtname} 	Currently opened file's extension
// ${fileDirname} 	Currently opened file's folder path
// ${fileDirnameBasename} 	Currently opened file's folder name
// ${lineNumber} 	Currently selected line number in the active file
// ${columnNumber} 	Currently selected column number in the active file
// ${selectedText} 	Currently selected text in the active file
// ${pathSeparator} 	Character used by the operating system to separate components in file paths
// ${/} 	Shorthand for ${pathSeparator}

// Converts Predefined variables from vscode to actual values
export function convertPredefinedVariables(input: string): string {
  const activeTextEditor = vscode.window.activeTextEditor;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  let result = input;

  // ${userHome} - Path of the user's home folder
  result = result.replace(/\$\{userHome\}/g, os.homedir());
  // ~ - Path to the user's home directory
  if (result.includes("~")) {
    const homedir = os.homedir();
    result = path.join(homedir, result.replace("~", ""));
  }

  // ${workspaceFolder} - Path of the folder opened in VS Code
  if (workspaceFolder) {
    result = result.replace(/\$\{workspaceFolder\}/g, workspaceFolder.uri.fsPath);
  }

  // ${workspaceFolderBasename} - Name of the folder opened in VS Code without any slashes (/)
  if (workspaceFolder) {
    result = result.replace(/\$\{workspaceFolderBasename\}/g, path.basename(workspaceFolder.uri.fsPath));
  }

  if (activeTextEditor) {
    const currentFile = activeTextEditor.document.uri.fsPath;
    const currentFileWorkspaceFolder = vscode.workspace.getWorkspaceFolder(activeTextEditor.document.uri);
    const selection = activeTextEditor.selection;
    const selectedText = activeTextEditor.document.getText(selection);

    // ${file} - Currently opened file
    result = result.replace(/\$\{file\}/g, currentFile);

    // ${fileWorkspaceFolder} - Currently opened file's workspace folder
    if (currentFileWorkspaceFolder) {
      result = result.replace(/\$\{fileWorkspaceFolder\}/g, currentFileWorkspaceFolder.uri.fsPath);
    }

    // ${relativeFile} - Currently opened file relative to workspaceFolder
    if (currentFileWorkspaceFolder) {
      const relativePath = path.relative(currentFileWorkspaceFolder.uri.fsPath, currentFile);
      result = result.replace(/\$\{relativeFile\}/g, relativePath);
    }

    // ${relativeFileDirname} - Currently opened file's dirname relative to workspaceFolder
    if (currentFileWorkspaceFolder) {
      const relativeDirPath = path.relative(currentFileWorkspaceFolder.uri.fsPath, path.dirname(currentFile));
      result = result.replace(/\$\{relativeFileDirname\}/g, relativeDirPath);
    }

    // ${fileBasename} - Currently opened file's basename
    result = result.replace(/\$\{fileBasename\}/g, path.basename(currentFile));

    // ${fileBasenameNoExtension} - Currently opened file's basename with no file extension
    const basenameNoExt = path.basename(currentFile, path.extname(currentFile));
    result = result.replace(/\$\{fileBasenameNoExtension\}/g, basenameNoExt);

    // ${fileExtname} - Currently opened file's extension
    result = result.replace(/\$\{fileExtname\}/g, path.extname(currentFile));

    // ${fileDirname} - Currently opened file's folder path
    result = result.replace(/\$\{fileDirname\}/g, path.dirname(currentFile));

    // ${fileDirnameBasename} - Currently opened file's folder name
    result = result.replace(/\$\{fileDirnameBasename\}/g, path.basename(path.dirname(currentFile)));

    // ${lineNumber} - Currently selected line number in the active file
    result = result.replace(/\$\{lineNumber\}/g, (selection.active.line + 1).toString());

    // ${columnNumber} - Currently selected column number in the active file
    result = result.replace(/\$\{columnNumber\}/g, (selection.active.character + 1).toString());

    // ${selectedText} - Currently selected text in the active file
    result = result.replace(/\$\{selectedText\}/g, selectedText);
  }

  // ${pathSeparator} - Character used by the operating system to separate components in file paths
  result = result.replace(/\$\{pathSeparator\}/g, path.sep);

  // ${/} - Shorthand for ${pathSeparator}
  result = result.replace(/\$\{\/\}/g, path.sep);

  return result;
}
