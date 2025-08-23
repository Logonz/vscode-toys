import * as vscode from "vscode";
import { LoadIcons } from "./icons";
import { GetAllFilesInWorkspace, StartListener } from "./files";
import { showDebugQuickPick } from "./debugQuickPick";


export function activateSmartOpen(name: string, context: vscode.ExtensionContext) {
  LoadIcons();

  StartListener();

  const debugCommand = vscode.commands.registerCommand('vstoys.debug.showQuickPick', async () => {
    await showDebugQuickPick();
  });

  context.subscriptions.push(debugCommand);

  // setTimeout(() => {
  //   GetAllFilesInWorkspace();
  // }, 3000);

}
