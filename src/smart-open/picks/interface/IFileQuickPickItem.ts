import * as vscode from "vscode";
import { FileScore } from "../../scoring/interface/IScore";

export interface FileQuickPickItem extends vscode.QuickPickItem {
  file: vscode.Uri;
  score: FileScore;
}
