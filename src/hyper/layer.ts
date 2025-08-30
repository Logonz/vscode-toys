// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { ActionContext } from "./action";
import { printHyperOutput } from "./main";
import { LayerActivateInput, LayerDeactivateInput } from "./types";

let anyContextActive = false;
const activeContexts: Map<string, ActionContext> = new Map();
const globalContextId = "vstoys.hyper.global";
const countContextId = "hyper.count";
function updateCountContext() {
  const activeCount = Array.from(activeContexts.values()).filter((context) => context && context.IsActive()).length;
  vscode.commands.executeCommand("setContext", countContextId, activeCount);
  printHyperOutput(`  Updated count context (${countContextId}) to ${activeCount}`);
}

export function deactivateAllContexts(args: any) {
  console.log("[vstoys.hyper] DeactivateAll command executed", args);
  printHyperOutput("Deactivating all layer contexts", false);
  activeContexts.forEach((context) => {
    context.deactivate();
  });
  updateCountContext();
}

export function activateGlobalContext() {
  // Activates the global context when any layer context becomes active
  if (!anyContextActive) {
    anyContextActive = true;
    printHyperOutput(`  Activating global context (${globalContextId})`);
    vscode.commands.executeCommand("setContext", globalContextId, true);
  }
  updateCountContext();
}

export function deactivateGlobalContext(contextId: string) {
  // Remove the context from our tracking (ActionContext.deactivate() already calls destruct())
  activeContexts.delete(contextId);

  // Check if any context is still active and deactivate global context if not
  anyContextActive = false;
  activeContexts.forEach((value) => {
    if (value && value.IsActive()) {
      anyContextActive = true;
      return;
    }
  });

  if (!anyContextActive) {
    printHyperOutput(`  Deactivating global context (${globalContextId})`);
    vscode.commands.executeCommand("setContext", globalContextId, false);
  }

  updateCountContext();
}

// Layer management functions
export function activateLayer(input: LayerActivateInput) {
  console.log("[vstoys.hyper] ActivateLayer command executed", input);
  printHyperOutput(`Activating ${input.layerType} layer: ${input.layerName}`, false);

  if (!input.layerName) {
    vscode.window.showErrorMessage(`Invalid layer name: ${input.layerName}`);
    return;
  }

  if (input.layerName.length <= 1) {
    vscode.window.showErrorMessage(
      `Invalid layer name length: ${input.layerName} has to be at least 2 characters long`
    );
    return;
  }

  // Create or get existing context for this layer
  let context = activeContexts.get(input.layerName);
  if (!context) {
    const timeoutSeconds = input.timeout || 6; // Default timeout from config
    // Create the context directly here
    context = new ActionContext(input.layerName, timeoutSeconds, deactivateGlobalContext, activateGlobalContext);
    activeContexts.set(input.layerName, context);
  }

  // For switch layers, deactivate all other layers first
  if (input.layerType === "switch") {
    printHyperOutput("Switch layer: deactivating all other contexts", false);
    activeContexts.forEach((context, contextId) => {
      if (contextId !== input.layerName) {
        context.deactivate();
      }
    });
  }

  const timeoutSeconds = input.timeout || 6; // Default timeout from config
  context.activate(input.command, timeoutSeconds);
  updateCountContext();
}

export function deactivateLayer(input: LayerDeactivateInput) {
  console.log("[vstoys.hyper] DeactivateLayer command executed", input);

  if (input.deactivateAll) {
    printHyperOutput("Deactivating all layer contexts", false);
    activeContexts.forEach((context) => {
      context.deactivate();
    });
  } else {
    if (!input.layerName) {
      vscode.window.showErrorMessage(`Invalid layer name: ${input.layerName}`);
      return;
    }

    if (input.layerName.length <= 1) {
      vscode.window.showErrorMessage(
        `Invalid layer name length: ${input.layerName} has to be at least 2 characters long`
      );
      return;
    }

    const context = activeContexts.get(input.layerName);
    if (context) {
      printHyperOutput(`Deactivating layer: ${input.layerName}`, false);
      context.deactivate();
    } else {
      printHyperOutput(`Layer context not found: ${input.layerName}`, false);
    }
  }
  updateCountContext();
}
