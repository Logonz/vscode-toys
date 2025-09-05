import * as vscode from "vscode";

// Extended URI interface with custom label and paths
export interface UriExt {
  uri: vscode.Uri;
  fsPath: string;
  fileName: string;
  relativePath: string;
  customLabel: string | undefined;
}
