import * as vscode from "vscode";
import { createOutputChannel } from "../extension";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
export let printJumpOutput: (content: string, reveal?: boolean) => void;

export function activateJump(context: vscode.ExtensionContext) {
  printJumpOutput = createOutputChannel("Jump");
  printJumpOutput("Jump activated");

  // Get the current visible text editors from all groups
  // let visibleTextEditors = vscode.window.visibleTextEditors;
  // console.log("Visible text editors:", visibleTextEditors);

  // for (let editor of visibleTextEditors) {
  //   console.log("Editor:", editor);
  //   console.log(editor.visibleRanges);z
  //   console.log(editor.document.getText(editor.visibleRanges[0]));
  //   console.log("hej");
  // }
}
