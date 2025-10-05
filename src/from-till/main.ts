import * as vscode from "vscode";
import { createOutputChannel } from "../extension";
import { FromTillController } from "./fromTillController";

export function activateFromTill(name: string, context: vscode.ExtensionContext): void {
  const output = createOutputChannel(name);
  output(`${name} activating`);

  const controller = new FromTillController();
  context.subscriptions.push(controller);

  const register = (command: string, handler: (...args: unknown[]) => unknown) => {
    const disposable = vscode.commands.registerCommand(command, handler);
    context.subscriptions.push(disposable);
  };

  function deactivateAllHyperIfNeeded(args: any) {
    if (args && args.deactivateAllHyper) {
      try {
        vscode.commands.executeCommand("vstoys.hyper.deactivateAll");
      } catch (error) {
        console.error("Error executing hyper command:", error);
      }
    }
  }

  register("vstoys.from-till.findForward", (args) => {
    deactivateAllHyperIfNeeded(args);
    controller.findForward();
  });
  register("vstoys.from-till.findBackward", (args) => {
    deactivateAllHyperIfNeeded(args);
    controller.findBackward();
  });
  register("vstoys.from-till.tillForward", (args) => {
    deactivateAllHyperIfNeeded(args);
    controller.tillForward();
  });
  register("vstoys.from-till.tillBackward", (args) => {
    deactivateAllHyperIfNeeded(args);
    controller.tillBackward();
  });
  register("vstoys.from-till.repeat", (args) => {
    deactivateAllHyperIfNeeded(args);
    controller.repeat(1);
  });
  register("vstoys.from-till.repeatReverse", (args) => {
    deactivateAllHyperIfNeeded(args);
    controller.repeat(-1);
  });
  register("vstoys.from-till.cancelCapture", (args) => {
    deactivateAllHyperIfNeeded(args);
    controller.cancelCapture();
  });
  register("vstoys.from-till.cancelMode", (args) => {
    deactivateAllHyperIfNeeded(args);
    controller.cancelMode();
  });
  register("vstoys.from-till.accept", (args) => {
    deactivateAllHyperIfNeeded(args);
    controller.accept();
  });

  output(`${name} activated`);
}
