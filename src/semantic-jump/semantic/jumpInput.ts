import { commands, Disposable, StatusBarAlignment, StatusBarItem, TextEditor, window } from "vscode";

const cancellationChars = new Set(["\n"]);
export const subscriptions: Disposable[] = [];

export class JumpInput {
  statusBarItem: StatusBarItem;
  input = "";
  allowedChars = new Set("fjdkslaghrueiwoncmvFJDKSLAGHRUEIWONCMV".split(""));

  constructor(
    private readonly props: {
      textEditor: TextEditor;
      onInput(input: string, char: string): any;
      onCancel(...args: any[]): any;
    }
  ) {
    subscriptions.push(
      commands.registerCommand("type", this._onInput),
      window.onDidChangeTextEditorSelection(this._onCancel)
    );

    this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 1000);
  }

  public changeAllowedChars = (chars: string[]): void => {
    this.allowedChars = new Set(chars);
  };

  public updateStatusBar = (text: string): void => {
    this.statusBarItem.text = `░ ${text} ░`;
    this.statusBarItem.show();
  };

  public destroy = (): void => {
    this.statusBarItem.dispose();
    subscriptions.forEach((subscription) => subscription.dispose());
    subscriptions.length = 0;
    this.props.onCancel();
  };

  public deleteLastCharacter = (): string => {
    this.input = this.input.slice(0, -1);
    return this.input;
  };

  private readonly _onInput = ({ text }: { text: string }) => {
    const char = text;

    this.input += char;

    this.updateStatusBar(this.input);

    if (cancellationChars.has(char) || !this.allowedChars.has(char)) {
      this._onCancel();
    } else {
      return this.props.onInput(this.input, char);
    }
  };

  private readonly _onCancel = (...args: any[]) => {
    this.destroy();
    return this.props.onCancel(args);
  };
}
