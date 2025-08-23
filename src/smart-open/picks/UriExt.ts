import * as vscode from "vscode";

// Extended URI interface with custom label and paths
export interface UriExt {
  uri: vscode.Uri;
  customLabel: string;
  relativePath: string;
  fsPath: string;
}