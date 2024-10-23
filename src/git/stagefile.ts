import * as vscode from "vscode";
import { execSync } from "child_process";
import { printGitOutput } from "./main";

export function RegisterGitStageFile(): vscode.Disposable {
  return vscode.commands.registerCommand(
    "vstoys.git.stageFile",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found.");
        console.log("Error: No active editor found.");
        return;
      }

      if (editor.document.isDirty || editor.document.isUntitled) {
        vscode.window.showInformationMessage(
          "Save the file before staging."
        );
        console.log("Error: Save the file before staging.");
        return;
      }

      const fileUri = editor.document.uri;
      const filePath = vscode.workspace.asRelativePath(fileUri, false);

      try {
        console.log(`\n--- Staging File ---`);
        console.log(`File Path: ${filePath}`);
        printGitOutput(`Staging file: ${filePath}`);

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder found.");
          console.log("Error: No workspace folder found.");
          return;
        }
        const cwd = workspaceFolder.uri.fsPath;

        execSync(`git add "${filePath}"`, { cwd: cwd });
        
        // vscode.window.showInformationMessage("File staged successfully.");
        console.log("Hunk staged successfully.");
        printGitOutput("File staged successfully.");
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
        console.error("Error Details:", error);
      }
    }
  );
}
