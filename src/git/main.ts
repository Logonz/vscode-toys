import * as vscode from "vscode";
import { createOutputChannel } from "../extension"; // Ensure this is correctly implemented
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