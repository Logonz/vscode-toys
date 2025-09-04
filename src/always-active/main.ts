// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { createOutputChannel } from "../extension";
import path from "path";
import os from "os";
import { openFile } from "./openFile";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
let printAlwaysActiveOutput: (content: string, reveal?: boolean) => void;

export function activateAlwaysActive(name: string, context: vscode.ExtensionContext) {
  console.log(`Activating ${name}`);
  printAlwaysActiveOutput = createOutputChannel(`${name}`);
  printAlwaysActiveOutput(`${name} activating`);

  context.subscriptions.push(vscode.commands.registerCommand("vstoys.openFile", openFile));

  printAlwaysActiveOutput(`${name} activated`, false);
}
