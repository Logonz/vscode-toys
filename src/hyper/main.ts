// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { createOutputChannel } from "../extension";
import { startConfigListeners } from "./settings";
import { deactivateAllContexts } from "./layer";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
export let printHyperOutput: (content: string, reveal?: boolean) => void;

export function activateHyper(name: string, context: vscode.ExtensionContext) {
  printHyperOutput = createOutputChannel(name);
  printHyperOutput(`${name} activating`);

  // Initialize the count context to 0
  vscode.commands.executeCommand("setContext", "hyper.count", 0);
  printHyperOutput("Initialized hyper.count context to 0");

  startConfigListeners(context);

  // Register the deactivateAll command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vstoys.hyper.deactivateAll",
      deactivateAllContexts
    )
  );

  printHyperOutput(`${name} activated`, false);
}