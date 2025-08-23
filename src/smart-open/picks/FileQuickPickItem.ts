import * as vscode from "vscode";


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
