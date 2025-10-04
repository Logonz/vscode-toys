import * as vscode from "vscode";
import { pickColorType } from "../helpers/pickColorType";
import { fade, unfade } from "./fadeDecorator";

type MotionKind = "find" | "till";

type MotionDirection = 1 | -1;

interface MotionState {
  char: string;
  direction: MotionDirection;
  kind: MotionKind;
}

interface ModeState extends MotionState {
  editor: vscode.TextEditor;
  matches: vscode.Position[];
  currentIndex: number;
  origin: vscode.Position;
}

export class FromTillController implements vscode.Disposable {
  private lastMotion: MotionState | null = null;
  private captureResolver: ((value: string | undefined) => void) | null = null;
  private captureDisposables: vscode.Disposable[] = [];

  private modeState: ModeState | null = null;
  private modeDisposables: vscode.Disposable[] = [];

  private allMatchesDecoration: vscode.TextEditorDecorationType | null = null;
  private currentMatchDecoration: vscode.TextEditorDecorationType | null = null;

  dispose(): void {
    this.cancelCapture();
    this.stopMode();
    this.disposeDecorationTypes();
  }

  async findForward(): Promise<void> {
    await this.startMotion("find", 1);
  }

  async findBackward(): Promise<void> {
    await this.startMotion("find", -1);
  }

  async tillForward(): Promise<void> {
    await this.startMotion("till", 1);
  }

  async tillBackward(): Promise<void> {
    await this.startMotion("till", -1);
  }

  async repeat(): Promise<void> {
    if (this.modeState) {
      this.advanceWithinMode(1);
      return;
    }

    if (!this.lastMotion) {
      vscode.window.setStatusBarMessage("VSCode Toys: from-till has no motion to repeat", 1500);
      return;
    }

    await this.initializeModeFromMotion(this.lastMotion);
  }

  async repeatReverse(): Promise<void> {
    if (this.modeState) {
      this.advanceWithinMode(-1);
      return;
    }

    if (!this.lastMotion) {
      vscode.window.setStatusBarMessage("VSCode Toys: from-till has no motion to repeat", 1500);
      return;
    }

    // Re-initialize in current direction, then move backwards once (if possible)
    await this.initializeModeFromMotion(this.lastMotion);
    this.advanceWithinMode(-1);
  }

  cancelCapture(): void {
    if (this.captureResolver) {
      const resolver = this.captureResolver;
      this.captureResolver = null;
      resolver(undefined);
    }
    this.disposeCaptureListeners();
    this.stopMode();
  }

  cancelMode(): void {
    this.stopMode(true);
  }

  private async startMotion(kind: MotionKind, direction: MotionDirection): Promise<void> {
    this.stopMode();

    const char = await this.captureCharacter();
    if (!char) {
      return;
    }

    await this.initializeMode(kind, direction, char);
  }

  private async initializeModeFromMotion(motion: MotionState): Promise<void> {
    await this.initializeMode(motion.kind, motion.direction, motion.char);
  }

  private async initializeMode(kind: MotionKind, direction: MotionDirection, char: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const matches = this.collectMatches(editor.document, editor.selection.active, char, direction);
    if (matches.length === 0) {
      vscode.window.setStatusBarMessage(`VSCode Toys: '${char}' not found in that direction`, 1500);
      this.stopMode();
      return;
    }

    this.stopMode();

    this.modeState = {
      editor,
      matches,
      currentIndex: 0,
      char,
      direction,
      kind,
      origin: editor.selection.active,
    };

    this.lastMotion = { char, direction, kind };

    this.applyFadeDecorations();
    await vscode.commands.executeCommand("setContext", "vstoys.from-till.active", true);
    this.registerModeListeners();
    this.moveToCurrentMatch();
  }

  private registerModeListeners(): void {
    const typeDisposable = vscode.commands.registerCommand("type", async (args: { text: string }) => {
      const text = args?.text ?? "";

      if (!this.modeState) {
        await vscode.commands.executeCommand("default:type", args);
        return;
      }

      if (text === "\n" || text === "\r") {
        this.stopMode();
        return;
      }

      if (text.length === 0) {
        return;
      }

      if (text[0] === this.modeState.char) {
        this.advanceWithinMode(1);
        return;
      }

      // Any other key cancels the mode and forwards the input.
      this.stopMode();
      await vscode.commands.executeCommand("default:type", args);
    });

    const editorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor !== this.modeState?.editor) {
        this.stopMode();
      }
    });

    const windowDisposable = vscode.window.onDidChangeWindowState((event) => {
      if (!event.focused) {
        this.stopMode();
      }
    });

    const docDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
      if (this.modeState && event.document === this.modeState.editor.document) {
        this.stopMode();
      }
    });

    this.modeDisposables = [typeDisposable, editorDisposable, windowDisposable, docDisposable];
  }

  private collectMatches(
    document: vscode.TextDocument,
    start: vscode.Position,
    char: string,
    direction: MotionDirection
  ): vscode.Position[] {
    const matches: vscode.Position[] = [];

    if (direction === 1) {
      for (let line = start.line; line < document.lineCount; line += 1) {
        const text = document.lineAt(line).text;
        let searchIndex = line === start.line ? start.character + 1 : 0;
        while (searchIndex <= text.length) {
          const index = text.indexOf(char, searchIndex);
          if (index === -1) {
            break;
          }
          matches.push(new vscode.Position(line, index));
          searchIndex = index + 1;
        }
      }
      return matches;
    }

    for (let line = start.line; line >= 0; line -= 1) {
      const text = document.lineAt(line).text;
      let searchIndex = line === start.line ? start.character - 1 : text.length - 1;
      while (searchIndex >= 0) {
        const index = text.lastIndexOf(char, searchIndex);
        if (index === -1) {
          break;
        }
        matches.push(new vscode.Position(line, index));
        searchIndex = index - 1;
      }
    }

    return matches;
  }

  private advanceWithinMode(step: number): void {
    const state = this.modeState;
    if (!state) {
      return;
    }

    const nextIndex = state.currentIndex + step;
    if (nextIndex < 0 || nextIndex >= state.matches.length) {
      vscode.window.setStatusBarMessage("VSCode Toys: no more matches", 1500);
      return;
    }

    state.currentIndex = nextIndex;
    this.moveToCurrentMatch();
  }

  private moveToCurrentMatch(): void {
    const state = this.modeState;
    if (!state) {
      return;
    }

    const matchPosition = state.matches[state.currentIndex];
    const destination = this.calculateDestination(state.editor, matchPosition, state.kind, state.direction);

    state.editor.selection = new vscode.Selection(destination, destination);
    state.editor.revealRange(
      new vscode.Range(destination, destination),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );

    this.applyDecorations();
  }

  private calculateDestination(
    editor: vscode.TextEditor,
    matchPosition: vscode.Position,
    kind: MotionKind,
    direction: MotionDirection
  ): vscode.Position {
    if (kind === "find") {
      return matchPosition;
    }

    if (direction === 1) {
      if (matchPosition.character === 0) {
        return new vscode.Position(matchPosition.line, 0);
      }
      return matchPosition.translate(0, -1);
    }

    const lineLength = editor.document.lineAt(matchPosition.line).text.length;
    if (matchPosition.character >= lineLength - 1) {
      return new vscode.Position(matchPosition.line, lineLength);
    }

    return matchPosition.translate(0, 1);
  }

  private applyDecorations(): void {
    const state = this.modeState;
    if (!state) {
      return;
    }

    this.ensureDecorationTypes();
    if (!this.allMatchesDecoration || !this.currentMatchDecoration) {
      return;
    }

    const decorationOptions = state.matches.map((position) => {
      const range = new vscode.Range(position, position.translate(0, 1));
      const content = this.resolveMatchCharacter(state.editor, range);
      return {
        range,
        renderOptions: {
          before: {
            contentText: content,
          },
        },
      } satisfies vscode.DecorationOptions;
    });

    const currentDecoration = decorationOptions[state.currentIndex] ? [decorationOptions[state.currentIndex]] : [];
    const otherDecorations = decorationOptions.filter((_, index) => index !== state.currentIndex);

    state.editor.setDecorations(this.allMatchesDecoration, otherDecorations);
    state.editor.setDecorations(this.currentMatchDecoration, currentDecoration);
  }

  private ensureDecorationTypes(): void {
    const config = vscode.workspace.getConfiguration("vstoys.from-till");
    const background = config.get<string>("highlightBackground", "editor.findMatchHighlightBackground");
    const currentBackground = config.get<string>("highlightCurrentBackground", "activityBarBadge.background");
    const foreground = config.get<string>("highlightForeground", "button.foreground");

    if (!this.allMatchesDecoration) {
      this.allMatchesDecoration = vscode.window.createTextEditorDecorationType({
        before: {
          backgroundColor: pickColorType(background),
          color: pickColorType(foreground),
          textDecoration: "none;position:absolute;z-index:999999;max-height:100%;",
        },
      });
    }

    if (!this.currentMatchDecoration) {
      this.currentMatchDecoration = vscode.window.createTextEditorDecorationType({
        // borderWidth: "1px",
        // borderStyle: "solid",
        // borderColor: pickColorType("editorCursor.foreground"),
        before: {
          backgroundColor: pickColorType(currentBackground),
          color: pickColorType(foreground),
          textDecoration: "none;position:absolute;z-index:999999;max-height:100%;",
        },
      });
    }
  }

  private resolveMatchCharacter(editor: vscode.TextEditor, range: vscode.Range): string {
    const docChar = editor.document.getText(range);
    if (docChar.length > 0 && docChar !== "\n" && docChar !== "\r") {
      return docChar;
    }

    return this.modeState?.char ?? "";
  }

  private stopMode(restoreOrigin = false): void {
    const state = this.modeState;
    if (state?.editor) {
      unfade(state.editor);

      if (this.allMatchesDecoration) {
        state.editor.setDecorations(this.allMatchesDecoration, []);
      }
      if (this.currentMatchDecoration) {
        state.editor.setDecorations(this.currentMatchDecoration, []);
      }

      if (restoreOrigin) {
        const document = state.editor.document;
        const targetLine = Math.min(Math.max(state.origin.line, 0), Math.max(document.lineCount - 1, 0));
        const lineLength = document.lineAt(targetLine).text.length;
        const targetChar = Math.min(Math.max(state.origin.character, 0), lineLength);
        const originPosition = new vscode.Position(targetLine, targetChar);
        state.editor.selection = new vscode.Selection(originPosition, originPosition);
        state.editor.revealRange(new vscode.Range(originPosition, originPosition));
      }
    }

    this.modeState = null;
    this.modeDisposables.forEach((disposable) => disposable.dispose());
    this.modeDisposables = [];
    vscode.commands.executeCommand("setContext", "vstoys.from-till.active", false);
  }

  private applyFadeDecorations(): void {
    const state = this.modeState;
    if (!state) {
      return;
    }

    const document = state.editor.document;
    const ranges: vscode.Range[] = [];
    for (let line = 0; line < document.lineCount; line += 1) {
      ranges.push(document.lineAt(line).range);
    }

    fade(state.editor, ranges);
  }

  private disposeDecorationTypes(): void {
    if (this.allMatchesDecoration) {
      this.allMatchesDecoration.dispose();
      this.allMatchesDecoration = null;
    }
    if (this.currentMatchDecoration) {
      this.currentMatchDecoration.dispose();
      this.currentMatchDecoration = null;
    }
  }

  private async captureCharacter(): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }

    if (this.captureResolver) {
      this.cancelCapture();
    }

    await vscode.commands.executeCommand("setContext", "vstoys.from-till.awaitingChar", true);

    return new Promise<string | undefined>((resolve) => {
      let resolved = false;
      const finish = (value: string | undefined) => {
        if (resolved) {
          return;
        }
        resolved = true;
        this.disposeCaptureListeners();
        resolve(value);
      };

      this.captureResolver = finish;

      const typeDisposable = vscode.commands.registerCommand("type", async (args: { text: string }) => {
        const text = args?.text ?? "";
        if (!this.captureResolver) {
          await vscode.commands.executeCommand("default:type", args);
          return;
        }

        if (text.length === 0) {
          finish(undefined);
          return;
        }

        const char = text[0];
        this.captureResolver = null;
        finish(char);
      });

      const selectionDisposable = vscode.window.onDidChangeTextEditorSelection(() => finish(undefined));
      const editorDisposable = vscode.window.onDidChangeActiveTextEditor(() => finish(undefined));
      const windowDisposable = vscode.window.onDidChangeWindowState((event) => {
        if (!event.focused) {
          finish(undefined);
        }
      });

      this.captureDisposables = [typeDisposable, selectionDisposable, editorDisposable, windowDisposable];
    });
  }

  private disposeCaptureListeners(): void {
    this.captureDisposables.forEach((item) => item.dispose());
    this.captureDisposables = [];
    this.captureResolver = null;
    vscode.commands.executeCommand("setContext", "vstoys.from-till.awaitingChar", false);
  }
}
