import { commands, Disposable, StatusBarAlignment, StatusBarItem, TextEditor, window } from "vscode";

const cancellationChars = new Set(["\n"]);
export const subscriptions: Disposable[] = [];

export interface MotionInputProps {
  textEditor: TextEditor;
  operation: string;
  onComplete(operation: string, textObject: string, count: number): any;
  onCancel(...args: any[]): any;
}

export class MotionInput {
  statusBarItem: StatusBarItem;
  input = "";
  count = "";

  constructor(private readonly props: MotionInputProps) {
    subscriptions.push(
      commands.registerCommand("type", this._onInput),
      window.onDidChangeTextEditorSelection(this._onCancel)
    );

    this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 1000);
    this.updateStatusBar(this.props.operation);

    // TODO: Do we want to make this configurable?
    // Disable all hyper layers
    commands.executeCommand("vstoys.hyper.deactivateAll");

    // Set context to enable escape key binding
    commands.executeCommand("setContext", "vstoys.motions.inputActive", true);
  }

  public updateStatusBar = (text: string): void => {
    this.statusBarItem.text = `${text}`;
    this.statusBarItem.show();
  };

  public destroy = (): void => {
    this.statusBarItem.dispose();
    subscriptions.forEach((subscription) => subscription.dispose());

    // Clear context to disable escape key binding
    commands.executeCommand("setContext", "vstoys.motions.inputActive", false);
  };

  private readonly _onInput = ({ text }: { text: string }) => {
    const char = text;

    if (cancellationChars.has(char)) {
      this._onCancel();
      return;
    }

    // Check if it's a number (for count) - now accepts digits after operation is set
    if (/\d/.test(char)) {
      this.count += char;
      this.updateStatusBar(this.props.operation + this.count);
      return;
    }

    // Check if it's a valid text object
    const validTextObjects = ["(", ")", "[", "]", "{", "}", "<", ">", '"', "'", "`"];
    if (validTextObjects.includes(char)) {
      const count = this.count ? parseInt(this.count) : 1;
      this.destroy();
      return this.props.onComplete(this.props.operation, char, count);
    }

    // Invalid input, cancel
    this._onCancel();
  };

  private readonly _onCancel = (...args: any[]) => {
    this.destroy();
    return this.props.onCancel(args);
  };
}

export interface InteractiveMotionInputProps {
  textEditor: TextEditor;
  onComplete(operation: string, textObject: string, count: number): any;
  onCancel(...args: any[]): any;
}

export class InteractiveMotionInput {
  statusBarItem: StatusBarItem;
  input = "";
  count = "";
  operation = "";

  constructor(private readonly props: InteractiveMotionInputProps) {
    subscriptions.push(
      commands.registerCommand("type", this._onInput),
      window.onDidChangeTextEditorSelection(this._onCancel)
    );

    this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 1000);
    this.updateStatusBar("");

    // TODO: Do we want to make this configurable?
    // Disable all hyper layers
    commands.executeCommand("vstoys.hyper.deactivateAll");

    // Set context to enable escape key binding
    commands.executeCommand("setContext", "vstoys.motions.inputActive", true);
  }

  public updateStatusBar = (text: string): void => {
    this.statusBarItem.text = `Motion: ${text}`;
    this.statusBarItem.show();
  };

  public destroy = (): void => {
    this.statusBarItem.dispose();
    subscriptions.forEach((subscription) => subscription.dispose());

    // Clear context to disable escape key binding
    commands.executeCommand("setContext", "vstoys.motions.inputActive", false);
  };

  private readonly _onInput = ({ text }: { text: string }) => {
    const char = text;

    if (cancellationChars.has(char)) {
      this._onCancel();
      return;
    }

    this.input += char;
    this.updateStatusBar(this.input);

    if (this._tryParseComplete()) {
      const count = this.count ? parseInt(this.count) : 1;
      const textObject = this.input.slice(this.operation.length + this.count.length);
      this.destroy();
      return this.props.onComplete(this.operation, textObject, count);
    }
  };

  private readonly _onCancel = (...args: any[]) => {
    this.destroy();
    return this.props.onCancel(args);
  };

  private _tryParseComplete(): boolean {
    // Parse patterns like: 2di(, da", yi{, etc.
    const match = this.input.match(/^(\d*)([dyvs])([ia])(.?)$/);
    if (!match) {
      return false;
    }

    const [, countStr, op, modifier, textObj] = match;

    if (!textObj) {
      return false;
    }

    this.count = countStr;
    this.operation = op + modifier;

    const validTextObjects = ["(", ")", "[", "]", "{", "}", "<", ">", '"', "'", "`"];
    return validTextObjects.includes(textObj);
  }
}
