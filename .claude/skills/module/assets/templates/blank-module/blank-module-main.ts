import * as vscode from "vscode";
import { createOutputChannel } from "../extension";

// Configuration namespace - update "module" to your module name
const ConfigSpace = "vstoys.module";

/**
 * Helper function for logging output
 * Initialized in activate function
 */
let printOutput: (content: string, reveal?: boolean) => void;

/**
 * Activates the module
 *
 * Called by src/extension.ts during extension activation.
 * Use this function to:
 * - Load initial configuration
 * - Register commands
 * - Register event listeners
 * - Set up decorations and other resources
 */
export function activateModule(
  name: string,
  context: vscode.ExtensionContext
): void {
  // 1. Setup logging
  console.log(`Activating ${name}`);
  printOutput = createOutputChannel(`${name}`);
  printOutput(`${name} activating`);

  // 2. Load initial configuration
  let config = vscode.workspace.getConfiguration(`${ConfigSpace}`);
  // let setting1: string | undefined = config.get("setting1");
  // let setting2: number | undefined = config.get("setting2");

  // 3. Register commands
  // Example command:
  // context.subscriptions.push(
  //   vscode.commands.registerCommand("vstoys.module.action", async () => {
  //     const editor = vscode.window.activeTextEditor;
  //     if (!editor) {
  //       return;
  //     }
  //     // Implementation here
  //   })
  // );

  // 4. Register configuration change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      // Check if any of your settings changed
      // if (event.affectsConfiguration(`${ConfigSpace}.setting1`)) {
      //   printOutput("Configuration changed");
      //   config = vscode.workspace.getConfiguration(`${ConfigSpace}`);
      //   setting1 = config.get("setting1");
      //   setting2 = config.get("setting2");
      // }
    })
  );

  // 5. Log completion
  printOutput(`${name} activated`, false);
}
