import * as vscode from "vscode";

export interface RegisterContent {
  text: string;
  timestamp: Date;
}

export class RegisterManager {
  private registers: Map<number, RegisterContent> = new Map();
  private readonly maxRegisters = 5;

  public storeInRegister(registerNumber: number, text: string): void {
    if (registerNumber < 1 || registerNumber > this.maxRegisters) {
      throw new Error(`Register number must be between 1 and ${this.maxRegisters}`);
    }

    if (!text || text.trim() === "") {
      return;
    }

    this.registers.set(registerNumber, {
      text: text,
      timestamp: new Date(),
    });
  }

  public getFromRegister(registerNumber: number): string | undefined {
    if (registerNumber < 1 || registerNumber > this.maxRegisters) {
      return undefined;
    }

    const content = this.registers.get(registerNumber);
    return content?.text;
  }

  public getAllRegisters(): Map<number, RegisterContent> {
    return new Map(this.registers);
  }

  public hasContent(registerNumber: number): boolean {
    return this.registers.has(registerNumber) && this.registers.get(registerNumber)!.text.trim() !== "";
  }

  public getNonEmptyRegisters(): Array<{ number: number; content: RegisterContent }> {
    const nonEmpty: Array<{ number: number; content: RegisterContent }> = [];

    for (let i = 1; i <= this.maxRegisters; i++) {
      if (this.hasContent(i)) {
        nonEmpty.push({
          number: i,
          content: this.registers.get(i)!,
        });
      }
    }

    return nonEmpty;
  }

  public clear(): void {
    this.registers.clear();
  }

  public clearRegister(registerNumber: number): void {
    if (registerNumber >= 1 && registerNumber <= this.maxRegisters) {
      this.registers.delete(registerNumber);
    }
  }

  public getPreview(text: string, maxLength: number = 50): string {
    if (!text) return "";

    const singleLine = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

    if (singleLine.length <= maxLength) {
      return singleLine;
    }

    return singleLine.substring(0, maxLength - 3) + "...";
  }
}
