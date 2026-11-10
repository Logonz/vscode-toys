import { commands, Disposable, StatusBarAlignment, StatusBarItem, TextEditor, window } from "vscode";

const cancellationChars = new Set(["\n"]);

/**
 * Captures typing through the `type` command while the editor keeps focus, so the QuickPick's own input stays
 * empty and VS Code never re-filters or re-sorts the items. Cancels when the editor's selection changes.
 */
export class InlineInput {
  statusBarItem: StatusBarItem;
  input = "";
  private readonly subscriptions: Disposable[];
  private destroyed = false;

  constructor(
    private readonly props: {
      textEditor: TextEditor;
      onInput(input: string, char: string): void;
      onCancel(): void;
    }
  ) {
    this.subscriptions = [
      commands.registerCommand("type", this._onInput),
      window.onDidChangeTextEditorSelection(this.destroy),
    ];
    this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 1000);
  }

  public updateStatusBar = (text: string, activityIndicatorState: boolean): void => {
    const indicator = activityIndicatorState ? "⚪" : "🔴";
    this.statusBarItem.text = `░ ${text} ░ ${indicator}`;
    this.statusBarItem.show();
  };

  /** Releases the `type` command and calls `onCancel`, once however many paths lead here. */
  public destroy = (): void => {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.statusBarItem.dispose();
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.props.onCancel();
  };

  public deleteLastCharacter = (): string => {
    this.input = this.input.slice(0, -1);
    return this.input;
  };

  public pasteText = (clipboardText: string): void => {
    // Remove all newline characters (Windows: \r\n, Unix: \n, Mac: \r)
    let sanitized = clipboardText.replace(/[\r\n]+/g, "");

    // Limit length to prevent pasting entire files
    // 500 chars covers deep paths while preventing file content paste
    const MAX_PASTE_LENGTH = 500;
    if (sanitized.length > MAX_PASTE_LENGTH) {
      sanitized = sanitized.substring(0, MAX_PASTE_LENGTH);
    }

    // Use existing addInput which handles cancellation chars and callbacks
    if (sanitized.length > 0) {
      this.addInput(sanitized);
    }
  };

  public addInput = (newInput: string): void => {
    // Check if the new input contains any cancellation characters
    for (const char of newInput) {
      if (cancellationChars.has(char)) {
        this.destroy();
        return;
      }
    }

    // Update the input state with the new input
    this.input += newInput;

    // Call the onInput callback with the full input and the last character
    const lastChar = newInput.length > 0 ? newInput[newInput.length - 1] : "";
    this.props.onInput(this.input, lastChar);
  };

  public handleDirectInput = (newInput: string): void => {
    this.addInput(newInput);
  };

  private readonly _onInput = ({ text }: { text: string }) => {
    this.addInput(text);
  };
}
