import * as vscode from "vscode";
import { RegisterManager } from "./registerManager";
import { RegisterQuickPick } from "./quickPick";
import { createOutputChannel } from "../extension";

let printRegistersOutput: (content: string, reveal?: boolean) => void;

export function activateRegisters(name: string, context: vscode.ExtensionContext) {
  console.log(`Activating ${name}`);
  printRegistersOutput = createOutputChannel(`${name}`);
  printRegistersOutput(`${name} activating`);

  const registerManager = new RegisterManager();
  const quickPick = new RegisterQuickPick(registerManager, printRegistersOutput);

  const copyToRegister = (registerNumber: number) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("Can't copy with no active editor");
      return;
    }

    let text: string;
    if (editor.selection.isEmpty) {
      const line = editor.document.lineAt(editor.selection.active.line);
      text = line.text;
      printRegistersOutput(`Copied line to register ${registerNumber}: ${registerManager.getPreview(text, 20)}`);
    } else {
      text = editor.document.getText(editor.selection);
      printRegistersOutput(`Copied selection to register ${registerNumber}: ${registerManager.getPreview(text, 20)}`);
    }

    registerManager.storeInRegister(registerNumber, text);
    vscode.window.showInformationMessage(`Text saved to register ${registerNumber}`);
  };

  const pasteFromRegister = (registerNumber: number) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("Can't paste with No active editor");
      return;
    }

    const text = registerManager.getFromRegister(registerNumber);
    if (!text) {
      vscode.window.showWarningMessage(`Register ${registerNumber} is empty`);
      return;
    }

    editor.edit((editBuilder) => {
      if (editor.selection.isEmpty) {
        editBuilder.insert(editor.selection.active, text);
      } else {
        editBuilder.replace(editor.selection, text);
      }
    });

    printRegistersOutput(`Pasted from register ${registerNumber}: ${registerManager.getPreview(text, 20)}`);
  };

  const showRegisterPastePicker = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("Can't paste with no active editor");
      return;
    }

    const selectedText = await quickPick.showRegisterPastePicker();
    if (selectedText) {
      editor.edit((editBuilder) => {
        if (editor.selection.isEmpty) {
          editBuilder.insert(editor.selection.active, selectedText);
        } else {
          editBuilder.replace(editor.selection, selectedText);
        }
      });
    }
  };

  const showRegisterCopyPicker = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("Can't copy with no active editor");
      return;
    }

    const selectedRegister = await quickPick.showCopyPicker();
    if (selectedRegister !== undefined) {
      // Copy to the selected register
      copyToRegister(selectedRegister);
    }
  };

  for (let i = 1; i <= 5; i++) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`vstoys.registers.copyToRegister${i}`, () => copyToRegister(i))
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(`vstoys.registers.pasteFromRegister${i}`, () => pasteFromRegister(i))
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("vstoys.registers.showRegisterPastePicker", showRegisterPastePicker)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vstoys.registers.showRegisterCopyPicker", showRegisterCopyPicker)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vstoys.registers.clearAllRegisters", () => {
      registerManager.clear();
      vscode.window.showInformationMessage("All registers cleared");
      printRegistersOutput("All registers cleared");
    })
  );

  vscode.commands.executeCommand("setContext", "vstoys.registers.active", true);

  printRegistersOutput(`${name} activated`, false);
}
