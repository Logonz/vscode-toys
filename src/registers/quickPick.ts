import * as vscode from "vscode";
import { RegisterManager, RegisterContent } from "./registerManager";

export interface RegisterQuickPickItem extends vscode.QuickPickItem {
  registerNumber: number;
  content: RegisterContent;
}

export class RegisterQuickPick {
  constructor(
    private registerManager: RegisterManager,
    private printOutput: (content: string, reveal?: boolean) => void
  ) {}

  public async showCopyPicker(): Promise<number | undefined> {
    const config = vscode.workspace.getConfiguration("vstoys.registers");
    const maxPreviewLength = config.get<number>("maxPreviewLength", 200);

    // Show ALL registers (1-5), regardless of whether they have content
    const items: RegisterQuickPickItem[] = [];
    for (let i = 1; i <= 5; i++) {
      const hasContent = this.registerManager.hasContent(i);

      let description: string;
      let detail: string;

      if (hasContent) {
        const content = this.registerManager.getFromRegister(i)!;
        const registerContent = this.registerManager.getAllRegisters().get(i)!;
        description = this.registerManager.getPreview(content, maxPreviewLength);
        detail = `Stored: ${this.formatTimestamp(registerContent.timestamp)}`;
      } else {
        description = "Empty";
        detail = "No content stored";
      }

      items.push({
        label: `Register ${i}`,
        description: description,
        detail: detail,
        registerNumber: i,
        content: hasContent ? this.registerManager.getAllRegisters().get(i)! : { text: "", timestamp: new Date() },
      });
    }

    const quickPick = vscode.window.createQuickPick<RegisterQuickPickItem>();
    quickPick.items = items;
    quickPick.title = "Select Register to Copy To";
    quickPick.placeholder = "Choose a register to save current selection (or press 1-5 for quick selection)";
    quickPick.canSelectMany = false;

    return new Promise<number | undefined>((resolve) => {
      quickPick.onDidChangeSelection((selection) => {
        if (selection.length > 0) {
          const selected = selection[0];
          this.printOutput(`Selected register ${selected.registerNumber} for copying`);
          quickPick.hide();
          resolve(selected.registerNumber);
        }
      });

      quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        if (selected) {
          this.printOutput(`Selected register ${selected.registerNumber} for copying`);
          quickPick.hide();
          resolve(selected.registerNumber);
        }
      });

      // Handle keyboard shortcuts for direct register selection (1-5)
      quickPick.onDidChangeValue((value) => {
        // Check if the user typed a number 1-5
        if (value.length === 1 && /^[1-5]$/.test(value)) {
          const registerNumber = parseInt(value);

          // Always allow copying to any register (1-5), regardless of showEmptyRegisters setting
          this.printOutput(`Keyboard shortcut: Selected register ${registerNumber} for copying`);
          quickPick.hide();
          resolve(registerNumber);
          return;
        }

        // Clear the value to prevent it from interfering with filtering
        if (value.length === 1 && /^[1-5]$/.test(value)) {
          setTimeout(() => (quickPick.value = ""), 0);
        }
      });

      quickPick.onDidHide(() => {
        resolve(undefined);
      });

      quickPick.show();
    });
  }

  public async showRegisterPastePicker(): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration("vstoys.registers");
    const maxPreviewLength = config.get<number>("maxPreviewLength", 200);
    const showEmptyRegisters = config.get<boolean>("showEmptyRegisters", true);

    const items: RegisterQuickPickItem[] = [];

    for (let i = 1; i <= 5; i++) {
      const hasContent = this.registerManager.hasContent(i);

      // Only include register if it has content OR if we're showing empty registers
      if (hasContent || showEmptyRegisters) {
        let description: string;
        let detail: string;

        if (hasContent) {
          const content = this.registerManager.getFromRegister(i)!;
          const registerContent = this.registerManager.getAllRegisters().get(i)!;
          description = this.registerManager.getPreview(content, maxPreviewLength);
          detail = `Stored: ${this.formatTimestamp(registerContent.timestamp)}`;
        } else {
          description = "Empty";
          detail = "No content stored";
        }

        items.push({
          label: `Register ${i}`,
          description: description,
          detail: detail,
          registerNumber: i,
          content: hasContent ? this.registerManager.getAllRegisters().get(i)! : { text: "", timestamp: new Date() },
        });
      }
    }

    if (items.length === 0) {
      vscode.window.showInformationMessage("No registers contain content");
      return undefined;
    }

    const quickPick = vscode.window.createQuickPick<RegisterQuickPickItem>();
    quickPick.items = items;
    quickPick.title = "Select Register to Paste From";
    quickPick.placeholder = "Choose a register to paste from (or press 1-5 for quick selection)";
    quickPick.canSelectMany = false;

    return new Promise<string | undefined>((resolve) => {
      quickPick.onDidChangeSelection((selection) => {
        if (selection.length > 0) {
          const selected = selection[0];
          if (this.registerManager.hasContent(selected.registerNumber)) {
            const content = this.registerManager.getFromRegister(selected.registerNumber)!;
            this.printOutput(
              `Selected register ${selected.registerNumber}: ${this.registerManager.getPreview(content, 20)}`
            );
            quickPick.hide();
            resolve(content);
          } else {
            vscode.window.showWarningMessage(`Register ${selected.registerNumber} is empty`);
            quickPick.hide();
            resolve(undefined);
          }
        }
      });

      quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        if (selected) {
          if (this.registerManager.hasContent(selected.registerNumber)) {
            const content = this.registerManager.getFromRegister(selected.registerNumber)!;
            this.printOutput(
              `Selected register ${selected.registerNumber}: ${this.registerManager.getPreview(content, 20)}`
            );
            quickPick.hide();
            resolve(content);
          } else {
            vscode.window.showWarningMessage(`Register ${selected.registerNumber} is empty`);
            quickPick.hide();
            resolve(undefined);
          }
        }
      });

      // Handle keyboard shortcuts for direct register selection (1-5)
      quickPick.onDidChangeValue((value) => {
        // Check if the user typed a number 1-5
        if (value.length === 1 && /^[1-5]$/.test(value)) {
          const registerNumber = parseInt(value);

          // Check if this register has content by looking directly at the manager
          if (this.registerManager.hasContent(registerNumber)) {
            const content = this.registerManager.getFromRegister(registerNumber);
            if (content) {
              this.printOutput(
                `Keyboard shortcut: Selected register ${registerNumber}: ${this.registerManager.getPreview(
                  content,
                  20
                )}`
              );
              quickPick.hide();
              resolve(content);
              return;
            }
          } else {
            // Register is empty
            vscode.window.showWarningMessage(`Register ${registerNumber} is empty`);
            quickPick.hide();
            resolve(undefined);
            return;
          }
        }

        // If not a direct number shortcut, allow normal filtering
        // Clear the value to prevent it from interfering with filtering
        if (value.length === 1 && /^[1-5]$/.test(value)) {
          setTimeout(() => (quickPick.value = ""), 0);
        }
      });

      quickPick.onDidHide(() => {
        resolve(undefined);
      });

      quickPick.show();
    });
  }

  private formatTimestamp(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) {
      return `${seconds}s ago`;
    } else if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return timestamp.toLocaleDateString();
    }
  }
}
