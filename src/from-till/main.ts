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

  register("vstoys.from-till.findForward", () => controller.findForward());
  register("vstoys.from-till.findBackward", () => controller.findBackward());
  register("vstoys.from-till.tillForward", () => controller.tillForward());
  register("vstoys.from-till.tillBackward", () => controller.tillBackward());
  register("vstoys.from-till.repeat", () => controller.repeat());
  register("vstoys.from-till.repeatReverse", () => controller.repeatReverse());
  register("vstoys.from-till.cancelCapture", () => controller.cancelCapture());
  register("vstoys.from-till.cancelMode", () => controller.cancelMode());

  output(`${name} activated`);
}
