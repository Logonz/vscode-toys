// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { createOutputChannel } from "../extension";

const ConfigSpace = "vstoys.double-action";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
let printDoubleActionOutput: (content: string, reveal?: boolean) => void;

export function activateDoubleAction(name: string, context: vscode.ExtensionContext) {
  console.log(`Activating ${name}`);
  printDoubleActionOutput = createOutputChannel(`${name}`);
  printDoubleActionOutput(`${name} activating`);

  // TODO: Do we need to recreate this object to update the configuration?
  let config = vscode.workspace.getConfiguration(`${ConfigSpace}`);

  // Read the configuration settings
  let timeoutPress: boolean = config.get("timeoutPress") as boolean;
  let singlePressCommand: string = config.get("singlePressCommand") as string;
  let preDoublePressCommand = config.get("preDoublePressCommand") as string;
  let doublePressCommand: string = config.get("doublePressCommand") as string;
  let doublePressThreshold: number = config.get("doublePressThreshold") as number;
  let timeoutId: NodeJS.Timeout | null = null;
  let first = true;

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(`${ConfigSpace}.timeoutPress`) ||
        event.affectsConfiguration(`${ConfigSpace}.singlePressCommand`) ||
        event.affectsConfiguration(`${ConfigSpace}.preDoublePressCommand`) ||
        event.affectsConfiguration(`${ConfigSpace}.doublePressCommand`) ||
        event.affectsConfiguration(`${ConfigSpace}.doublePressThreshold`)
      ) {
        printDoubleActionOutput("Configuration changed");
        // TODO: Do we need to recreate this object to update the configuration?
        config = vscode.workspace.getConfiguration(`${ConfigSpace}`);
        timeoutPress = config.get("timeoutPress") as boolean;
        singlePressCommand = config.get("singlePressCommand") as string;
        preDoublePressCommand = config.get("preDoublePressCommand") as string;
        doublePressCommand = config.get("doublePressCommand") as string;
        doublePressThreshold = config.get("doublePressThreshold") as number;

        // Reset the timeoutId and first
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        first = true;
      }
    })
  );

  const disposable = vscode.commands.registerCommand(
    "vstoys.double-action.execute",
    () => {
      if (!timeoutPress) {
        if (!first) {
          console.log(`[${name}] Double press detected!`);

          first = true;
          // This is used personally to exit the previous command
          if (preDoublePressCommand !== "") {
            vscode.commands.executeCommand(preDoublePressCommand);
          }
          vscode.commands.executeCommand(doublePressCommand);

          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        } else {
          console.log(`[${name}] Single press`);

          first = false;
          vscode.commands.executeCommand(singlePressCommand);
          timeoutId = setTimeout(() => {
            first = true;
          }, doublePressThreshold);
        }
      } else {
        if (timeoutId) {
          // Double press detected
          clearTimeout(timeoutId);
          timeoutId = null;
          console.log(`[${name}] Double press detected!`);
          // This is used personally to exit the previous command
          if (preDoublePressCommand !== "") {
            vscode.commands.executeCommand(preDoublePressCommand);
          }
          // Execute your double press command here
          vscode.commands.executeCommand(doublePressCommand);
        } else {
          timeoutId = setTimeout(() => {
            // Single press
            timeoutId = null;
            console.log(`[${name}] Single press`);
            // Execute your single press command here
            vscode.commands.executeCommand(singlePressCommand);
          }, doublePressThreshold);
        }
      }
    }
  );
  context.subscriptions.push(disposable);

  printDoubleActionOutput(`${name} activated`, false);
}
