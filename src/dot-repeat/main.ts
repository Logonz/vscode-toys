// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { InlineInput } from "./inlineInput";
import { createOutputChannel } from "../extension";
import { ActionContext } from "./action";

export interface RepeatInput extends RepeatExit {
  contextId: string;
  command: string;
  timeoutSeconds?: number;
}

export interface RepeatExit {
  contextId?: string;
  deactivateAll?: boolean;
}

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
export let printDotRepeatOutput: (content: string, reveal?: boolean) => void;


export function activateDotRepeat(name: string, context: vscode.ExtensionContext) {
  printDotRepeatOutput = createOutputChannel(name);
  printDotRepeatOutput(`${name} activating`);
  
  let anyContextActive = false;
  const activeContexts: Map<string, ActionContext> = new Map();
  const globalContextId = "vstoys.dot-repeat.global";
  
  function createContext(contextId: string, timeoutSeconds: number = 3) {
    // Create the context
    const newContext = new ActionContext(contextId, timeoutSeconds, deactivateContext);
    activeContexts.set(contextId, newContext);
    vscode.commands.executeCommand("setContext", globalContextId, false);
    return newContext;
  }

  function deactivateContext(contextId: string) {
    // Destroy the context
    const context = activeContexts.get(contextId);
    if (context) {
      context.destruct();
      activeContexts.delete(contextId);
    }
    // Check if any context is active and deactivate global context if not
    anyContextActive = false;
    activeContexts.forEach((value) => {
      if (value && value.IsActive()) {
        anyContextActive = true;
        return;
      }
    });
    if (!anyContextActive) {
      printDotRepeatOutput(
        "  Deactivating global context (vstoys.dot-repeat.global)",
      );
      vscode.commands.executeCommand(
        "setContext",
        "vstoys.dot-repeat.global",
      );
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vstoys.dot-repeat.repeatExecute",
      (input: RepeatInput) => {
        console.log("[vstoys.dot-repeat] RepeatExecute command executed", input);
        printDotRepeatOutput("RepeatExecute command executed", false);
        if (input) {
          if (!input.contextId) {
            vscode.window.showErrorMessage(
              `Invalid contextId: ${input.contextId}`
            );
            return;
          } else if (input.contextId.length <= 1) {
            vscode.window.showErrorMessage(
              `Invalid contextId length: ${input.contextId} has to be at least 2 characters long`
            );
            return;
          }
          let context = activeContexts.get(input.contextId);
          if (!context) {
            context = createContext(input.contextId, input.timeoutSeconds);
          }
          context.activate(input.command);
        }
      }
    ),
    vscode.commands.registerCommand(
      "vstoys.dot-repeat.repeatExit",
      (input: RepeatExit) => {
        console.log("[vstoys.dot-repeat] RepeatExit command executed", input);
        if (input) {
          if (input.deactivateAll) {
            printDotRepeatOutput("Deactivating all contexts", false);
            activeContexts.forEach((context) => {
              context.deactivate();
            });
          } else {
            if (!input.contextId) {
              vscode.window.showErrorMessage(
                `Invalid contextId: ${input.contextId}`
              );
              return;
            } else if (input.contextId.length <= 1) {
              vscode.window.showErrorMessage(
                `Invalid contextId length: ${input.contextId} has to be at least 2 characters long`
              );
              return;
            }
            const context = activeContexts.get(input.contextId);
            if (context) {
              context.deactivate();
            } else {
              printDotRepeatOutput("Context not found", false);
            }
          }
        }
      }
    )
  );
  printDotRepeatOutput(`${name} activated`, false);
}
