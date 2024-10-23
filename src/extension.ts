// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { InlineInput } from "./dot-repeat/inlineInput";
import { activateSmartOpen } from "./smart-open/main";
import { activateDotRepeat } from "./dot-repeat/main";
import { activateDoubleAction } from "./double-action/main";
import { activateJump } from "./jump/main";
import { activateGit } from "./git/main";

try {
 require("./debug");
} catch (e) {
  console.log("Error importing debug.ts");
}

let activateFunctions: {
  name: string;
  activator: (context: vscode.ExtensionContext) => void;
}[] = [
  { name: "Double Action", activator: activateDoubleAction },
  { name: "Dot Repeat", activator: activateDotRepeat },
  { name: "Smart Open", activator: activateSmartOpen },
  { name: "Jump", activator: activateJump },
  { name: "Git", activator: activateGit },
];
let deactivateFunctions: { name: string; deactivator: () => void }[] = [
  { name: "Double Action", deactivator: () => {} },
  { name: "Dot Repeat", deactivator: () => {} },
  { name: "Smart Open", deactivator: () => {} },
  { name: "Jump", deactivator: () => {} },
  { name: "Git", deactivator: () => {} },
];

let DAcontext: vscode.ExtensionContext;
export function getExtensionContext(): vscode.ExtensionContext {
  return DAcontext;
}

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
export let printChannelOutput: (content: string, reveal?: boolean) => void;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  DAcontext = context;
  printChannelOutput = createOutputChannel("Main");
  printChannelOutput("Started");

  // Set a context to indicate that the extension is installed
  // To be used when binding commands to the extension
  vscode.commands.executeCommand("setContext", "VSToysInstalled", true);
  printChannelOutput("VSToysInstalled context set to true");

  // activateDoubleAction(context);

  // activateDotRepeat(context);

  // activateSmartOpen(context);

  // activateJump(context);

  // activateGit(context);

  activateFunctions.forEach((func) => {
    printChannelOutput(`---> Loading Module: ${func.name}`);
    console.log(`---> Loading Module: ${func.name}`);
    func.activator(context);
  });
}

// This method is called when your extension is deactivated
export function deactivate() { 
  // Set a context to indicate that the extension is not installed
  vscode.commands.executeCommand("setContext", "VSToysInstalled", false);
  printChannelOutput("VSToysInstalled context set to false");
  deactivateFunctions.forEach((func) => {
    printChannelOutput(`---> Loading Module: ${func.name}`);
    console.log(`---> Loading Module: ${func.name}`);
    func.deactivator();
  });
}

/**
 * Creates an output channel with the given name and returns a function that can be used to print content to the channel.
 *
 * @param name - The name of the output channel. Will be prefixed with "VSCode Toys - ".
 * @returns A function that takes content to be printed to the output channel, and an optional boolean to reveal the channel.
 */
export function createOutputChannel(name: string): (content: string, reveal?: boolean) => void {
  const outputChan = vscode.window.createOutputChannel(`VSCode Toys - ${name}`);
  return function (content: string, reveal = false): void {
    outputChan.appendLine(content);
    if (reveal) {
      outputChan.show(true);
    }
  }
}