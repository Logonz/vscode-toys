import * as vscode from "vscode";
import { execSync } from "child_process";
import { createOutputChannel } from "../extension"; // Ensure this is correctly implemented
import path from "path";
import { RegisterGitStageHunk } from "./stagehunk";
import { RegisterGitStageFile } from "./stagefile";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
export let printGitOutput: (content: string, reveal?: boolean) => void;

export function activateGit(name: string, context: vscode.ExtensionContext) {
  printGitOutput = createOutputChannel(`${name}`);
  console.log(`${name} extension activated.`);

  context.subscriptions.push(
    RegisterGitStageHunk(),
    RegisterGitStageFile(),
  );

}

function decoratorTest() {
  let beforeDecoration: vscode.ThemableDecorationAttachmentRenderOptions = {
    contentText: "HTML",
    backgroundColor: "#DA70D6AA",
    // border: `1px solid`,
    borderColor: "#DA70D6AA",

    color: "#ffffff",
    textDecoration:
      "none;position:absolute;z-index:999999;max-height:100%;left:-20px;",
  };
  const extPath = vscode.extensions.getExtension(
    "Logonz.vstoys"
  )?.extensionPath;
  console.log(extPath);
  const gutterIconPath = vscode.Uri.file(
    path.join(__dirname, "icons", "html.svg")
  );

  console.log(gutterIconPath);
  const decorator = vscode.window.createTextEditorDecorationType({
    backgroundColor: "#ffd90055",
    // color: "#000000",
    // before: beforeDecoration,
    // // light: {
    // //   backgroundColor: pickColorType(light_matchBackground),
    // //   color: pickColorType(light_matchForeground),
    // //   before: {
    // //     backgroundColor: letterBackgroundLight,
    // //     borderColor: letterBackgroundLight,
    // //     color: pickColorType(light_letterForeground),
    // //   },
    // // },
    // overviewRulerColor: "#4169E1",
    // overviewRulerLane: 2, // vscode.OverviewRulerLane.Center
    // gutterIconPath: gutterIconPath,
    // gutterIconSize: "contain",
    // backgroundColor: "rgba(0, 255, 0, 0.3)",
    after: beforeDecoration,
    // overviewRulerLane: vscode.OverviewRulerLane.Right,
    // border: "1px solid blue",
    overviewRulerLane: vscode.OverviewRulerLane.Right
  });
  const gg = vscode.scm.createSourceControl("git", "Git");
  const editor = vscode.window.activeTextEditor;
  const decorationOptions: vscode.DecorationOptions[] = [];
  const range = new vscode.Range(
    new vscode.Position(5, 0),
    new vscode.Position(5, 1)
  ); // Line number 5
  decorationOptions.push({ range: range,renderOptions: { before: beforeDecoration } });
  editor?.setDecorations(decorator, decorationOptions);

}

// // Retrieve blob hashes and file mode
// const blobInfo = getBlobInfo(filePath, cwd);
// if (!blobInfo) {
//   vscode.window.showErrorMessage(
//     "Failed to retrieve blob information."
//   );
//   console.log("Error: Failed to retrieve blob information.");
//   return;
// }
// const { oldHash, newHash, mode } = blobInfo;
// console.log(
//   `Blob Info - Old Hash: ${oldHash}, New Hash: ${newHash}, Mode: ${mode}`
// );

// Helper function to get old and new blob hashes and file mode
function getBlobInfo(
  filePath: string,
  cwd: string
): { oldHash: string; newHash: string; mode: string } | null {
  try {
    console.log(`Retrieving blob info for file: ${filePath}`);
    // Get the old hash and mode from the index
    console.log(`Executing: git ls-files --stage "${filePath}"`);
    const lsFilesOutput = execSync(`git ls-files --stage "${filePath}"`, {
      cwd,
    })
      .toString()
      .trim();
    console.log(`ls-files Output: ${lsFilesOutput}`);
    const [mode, oldHash] = lsFilesOutput.split(/\s+/);
    console.log(`Parsed ls-files - Mode: ${mode}, Old Hash: ${oldHash}`);

    // Get the new hash from the working directory
    console.log(`Executing: git hash-object "${filePath}"`);
    const newHash = execSync(`git hash-object "${filePath}"`, { cwd })
      .toString()
      .trim();
    console.log(`New Hash: ${newHash}`);

    return { oldHash, newHash, mode };
  } catch (error: any) {
    console.error("Failed to retrieve blob info:", error);
    return null;
  }
}
