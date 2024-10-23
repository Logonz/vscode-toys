// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { InlineInput } from "./dot-repeat/inlineInput";
import { activateSmartOpen } from "./smart-open/main";
import { activateDotRepeat } from "./dot-repeat/main";
import { activateDoubleAction } from "./double-action/main";
import { activateJump } from "./jump/main";
import { activateGit } from "./git/main";
import { activateCopyHighlight } from "./copy-highlight/main";

try {
  require("./debug");
} catch (e) {
  console.log("Error importing debug.ts");
}

let vsToys: {
  name: string;
  moduleContext: string;
  activator: (name: string, context: vscode.ExtensionContext) => void;
  deactivator: () => void;
}[] = [
  {
    name: "Copy Highlight",
    moduleContext: "copy-highlight",
    activator: activateCopyHighlight,
    deactivator: () => {},
  },
  {
    name: "Dot Repeat",
    moduleContext: "dot-repeat",
    activator: activateDotRepeat,
    deactivator: () => {},
  },
  {
    name: "Double Action",
    moduleContext: "double-action",
    activator: activateDoubleAction,
    deactivator: () => {},
  },
  {
    name: "Git",
    moduleContext: "git",
    activator: activateGit,
    deactivator: () => {},
  },
  {
    name: "Jump",
    moduleContext: "jump",
    activator: activateJump,
    deactivator: () => {},
  },
  {
    name: "Smart Open",
    moduleContext: "smart-open",
    activator: activateSmartOpen,
    deactivator: () => {},
  },
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
  vscode.commands.executeCommand("setContext", "vstoys.installed", true);
  printChannelOutput("vstoys.installed context set to true");

  vsToys.forEach((toy) => {
    const fullContext = `vstoys.${toy.moduleContext}.active`;
    // TODO: Check if the "toy" should be enabled or not
    printChannelOutput(`---> Loading Module: ${toy.name}, Activating Context: ${fullContext}`);
    console.log(`---> Loading Module: ${toy.name}, Activating Context: ${fullContext}`);
    vscode.commands.executeCommand("setContext", fullContext, true);
    toy.activator(toy.name, context);
  });
}

// This method is called when your extension is deactivated
export function deactivate() {
  // Set a context to indicate that the extension is not installed
  vscode.commands.executeCommand("setContext", "vstoys.installed", false);
  printChannelOutput("vstoys.installed context set to false");

  vsToys.forEach((toy) => {
    const fullContext = `vstoys.${toy.moduleContext}.active`;
    printChannelOutput(`---> Loading Module: ${toy.name}, Deactivating Context: ${fullContext}`);
    console.log(`---> Loading Module: ${toy.name}, Deactivating Context: ${fullContext}`);
    vscode.commands.executeCommand("setContext", fullContext, false);
    toy.deactivator();
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
  };
}
