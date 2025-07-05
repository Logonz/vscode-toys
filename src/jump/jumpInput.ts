import {
  commands,
  Disposable,
  StatusBarAlignment,
  StatusBarItem,
  TextEditor,
  window,
} from "vscode";

const cancellationChars = new Set(["\n"]);
// const allowedChars = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);
export const subscriptions: Disposable[] = [];

export class JumpInput {
  statusBarItem: StatusBarItem;
  input = "";
  topVisibleLineRelative: number;
  bottomVisibleLineRelative: number;
  // allowedChars = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);
  allowedChars = new Set(["1", "2", "3", "4", "5", "q", "w", "e", "r", "t"]);

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

    this.statusBarItem = window.createStatusBarItem(
      StatusBarAlignment.Right,
      1000
    );
    const editor = this.props.textEditor;
    const currentSelection = editor.selection;
    const currentLine = editor.document.lineAt(currentSelection.active.line);
    this.topVisibleLineRelative = currentLine.lineNumber - editor.visibleRanges[0].start.line;
    this.bottomVisibleLineRelative = editor.visibleRanges[editor.visibleRanges.length - 1].end.line - currentLine.lineNumber;
    console.log("topVisibleLineRelative", this.topVisibleLineRelative);
    console.log("bottomVisibleLineRelative", this.bottomVisibleLineRelative);
  }

  public changeAllowedChars = (chars: string[]): void => {
    this.allowedChars = new Set(chars);
    console.log("Allowed Chars: ", this.allowedChars);
  };

  public updateStatusBar = (
    text: string,
    // numberOfMatches: number,
    // activityIndicatorState: boolean
  ): void => {
    // const indicator = activityIndicatorState ? "⚪" : "🔴";
    // ┆ ┇ ┣ ┫ ╏ ▎▐ ░ ▒ ▓
    this.statusBarItem.text = `░ ${text} ░`;
    // this.statusBarItem.text = `${numberOfMatches} ░ ${text} ░ ${indicator}`;
    this.statusBarItem.show();
  };

  public destroy = (): void => {
    this.statusBarItem.dispose();
    subscriptions.forEach((subscription) => subscription.dispose());
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
      console.log("Cancelling JumpInput");
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
