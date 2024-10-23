import * as vscode from "vscode";
import { execSync } from "child_process";
import * as fs from "fs";
import * as tmp from "tmp";
import parseDiff from "parse-diff";
import deindent from "deindent"; // If not used, consider removing
import { printGitOutput } from "./main";

export function RegisterGitStageHunk(): vscode.Disposable {
  return vscode.commands.registerCommand(
    "vstoys.git.stageHunk",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found.");
        console.log("Error: No active editor found.");
        return;
      }
      if (editor.document.isDirty || editor.document.isUntitled) {
        vscode.window.showInformationMessage(
          "Save the file before staging a hunk."
        );
        console.log("Error: Save the file before staging a hunk.");
        return;
      }

      const position = editor.selection.active;
      const currentLine = position.line + 1; // Git diffs are 1-based
      const fileUri = editor.document.uri;
      const filePath = vscode.workspace.asRelativePath(fileUri, false);

      try {
        console.log(`\n--- Staging Hunk ---`);
        console.log(`Current Line: ${currentLine}`);
        console.log(`File Path: ${filePath}`);
        printGitOutput(
          `Staging hunk at line ${currentLine} in file ${filePath}`
        );

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder found.");
          console.log("Error: No workspace folder found.");
          return;
        }
        const cwd = workspaceFolder.uri.fsPath;
        printGitOutput(`Workspace Folder: ${cwd}`);
        console.log(`Workspace Folder: ${cwd}`);

        // Fetch the diff with zero context lines
        console.log(`Executing: git diff --unified=0 -- "${filePath}"`);
        const diffOutput = execSync(`git diff --unified=0 -- "${filePath}"`, {
          cwd: cwd,
        }).toString();
        console.log(`Diff Output:\n${diffOutput}`);

        const parsedDiff = parseDiff(diffOutput);
        console.log("Parsed Diff:", JSON.stringify(parsedDiff, null, 2));

        if (parsedDiff.length === 0) {
          vscode.window.showErrorMessage("No changes found for this file.");
          console.log("Error: No changes found in the diff for this file.");
          return;
        }

        const fileDiff = parsedDiff.find(
          (d) => d.to === filePath || d.from === filePath
        );
        console.log("File Diff Found:", JSON.stringify(fileDiff, null, 2));

        if (!fileDiff) {
          vscode.window.showErrorMessage("No changes found for this file.");
          console.log("Error: No fileDiff found.");
          return;
        }

        const indexLine = `index ${fileDiff.index?.join(" ")}`;
        console.log(indexLine);

        // Find the hunk containing the current line
        const hunk = fileDiff.chunks.find((chunk) => {
          const hunkStart = chunk.newStart;
          const hunkEnd = chunk.newStart + chunk.newLines - 1;
          console.log(`Checking Hunk: Start=${hunkStart}, End=${hunkEnd}`);
          return currentLine >= hunkStart && currentLine <= hunkEnd;
        });

        if (!hunk) {
          vscode.window.showErrorMessage(
            "No hunk found at the current cursor position."
          );
          console.log("Error: No hunk found at the current cursor position.");
          return;
        }

        console.log("Hunk Found:", JSON.stringify(hunk, null, 2));

        // Extract hunk lines from hunk.changes
        const hunkLines = hunk.changes
          .map((change) => change.content)
          .join("\n");
        console.log("Hunk Lines Extracted:\n" + hunkLines);

        // Construct the full patch with file headers and the hunk
        //index ${oldHash}..${newHash} ${mode}
        const fullPatch =
          deindent`
              diff --git a/${fileDiff.to} b/${fileDiff.to}
              ${indexLine}
              --- a/${fileDiff.to}
              +++ b/${fileDiff.to}
              @@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@
              ${hunkLines}
          `.trim() + "\n";

        printGitOutput(`Constructed Patch:\n${fullPatch}`);
        console.log("Constructed Patch:\n", fullPatch);

        // Write the full patch to a temporary file
        const tempPatch = tmp.fileSync({ postfix: ".patch" });
        try {
          fs.writeFileSync(tempPatch.name, fullPatch);
          console.log(`Patch written to temporary file: ${tempPatch.name}`);

          // Apply the patch to the Git index (stage the hunk)
          console.log(`Applying patch: git apply --cached --unidiff-zero "${tempPatch.name}"`);
          execSync(`git apply --cached --unidiff-zero "${tempPatch.name}"`, {
            cwd: cwd,
          });

          console.log("Patch applied successfully.");

          // vscode.window.showInformationMessage("Hunk staged successfully.");
          console.log("Hunk staged successfully.");
          printGitOutput("Hunk staged successfully.");
        } catch (error: any) {
          vscode.window.showErrorMessage(`Error: ${error.message}`);
          console.error("Error Details:", error);
        } finally {
          // Clean up the temporary file
          tempPatch.removeCallback();
          console.log("Temporary patch file removed.");
        }
      } catch (error: Error | any) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
        console.error("Error Details:", error);
      }
    }
  );
}