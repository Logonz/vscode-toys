import * as vscode from "vscode";
import { JumpInput } from "./jumpInput";
import { AdaptiveCharAssigner, JumpAssignment, JumpTargetMode } from "../shared/adaptiveCharAssigner";
import { ProgressiveJumpInput } from "./progressiveJumpInput";
import { pickColorType } from "../../helpers/pickColorType";
import { fetchSemanticTokens, filterTokens } from "./providers/semanticTokenProvider";
import { fetchDocumentSymbols } from "./providers/documentSymbolProvider";

type DecodedToken = {
  line: number;
  startChar: number;
  length: number;
  type: string;
  modifiers: string[];
  text?: string;
};

type JumpTarget = {
  token: DecodedToken;
  position: vscode.Position;
  char: string;
};

export class SemanticJumpHandler {
  private jumpInput: JumpInput | null = null;
  private progressiveInput: ProgressiveJumpInput | null = null;
  private decorationType: vscode.TextEditorDecorationType | null = null;
  private jumpTargets: JumpTarget[] = [];
  private debugModeDisposables: vscode.Disposable[] = [];
  private adaptiveAssigner = new AdaptiveCharAssigner();
  private jumpAssignments: JumpAssignment[] = [];

  async startSemanticJump(
    editor: vscode.TextEditor,
    debugMode: boolean = false,
    targetMode: JumpTargetMode = "start"
  ): Promise<void> {
    try {
      // Fetch semantic tokens for the visible range
      const rawTokens = await fetchSemanticTokens(editor, debugMode);
      const tokens = filterTokens(
        // If no semantic tokens, fall back to document symbols
        rawTokens.length ? rawTokens : await fetchDocumentSymbols(editor, debugMode),
        debugMode
      );
      if (!tokens || tokens.length === 0) {
        vscode.window.showInformationMessage("No semantic or document symbols found");
        return;
      }

      // Set context to indicate semantic jump is active
      vscode.commands.executeCommand("setContext", "vstoys.semantic-jump.active", true);
      vscode.commands.executeCommand("setContext", "vstoys.semantic-jump.targetMode", targetMode);

      const config = vscode.workspace.getConfiguration("vstoys.semantic-jump");
      const mode = config.get<string>("mode", "adaptive");

      if (debugMode) {
        this.createJumpTargets(tokens, debugMode);
        this.createDecorations(editor, debugMode);
        this.startDebugMode(editor);
      } else if (mode === "adaptive" || mode === "progressive") {
        // Use the new adaptive system
        this.jumpAssignments = this.adaptiveAssigner.assignChars(
          tokens,
          editor.selection.active,
          editor.document,
          "vstoys.semantic-jump",
          targetMode
        );
        this.createAdaptiveDecorations(editor);
        this.startProgressiveInput(editor);
      } else {
        // Fallback to simple mode
        this.createJumpTargets(tokens, debugMode);
        this.createDecorations(editor, debugMode);
        this.startInput(editor);
      }
    } catch (error) {
      console.error("Error starting semantic jump:", error);
      vscode.window.showErrorMessage("Failed to start semantic jump");
      // Make sure to clear context on error
      vscode.commands.executeCommand("setContext", "vstoys.semantic-jump.active", false);
      vscode.commands.executeCommand("setContext", "vstoys.semantic-jump.targetMode", undefined);
    }
  }

  private createJumpTargets(tokens: DecodedToken[], debugMode: boolean = false): void {
    const config = vscode.workspace.getConfiguration("vstoys.semantic-jump");
    const allowedChars = config.get<string>("jumpCharacters", "fjdkslaghrueiwoncmvFJDKSLAGHRUEIWONCMV").split("");

    // In debug mode, show all tokens without character limit
    if (debugMode) {
      this.jumpTargets = tokens.map((token, index) => ({
        token,
        position: new vscode.Position(token.line, token.startChar),
        char: "X", // All debug tokens use "X"
      }));
    } else {
      // Normal mode: limit to available characters
      this.jumpTargets = tokens.slice(0, allowedChars.length).map((token, index) => ({
        token,
        position: new vscode.Position(token.line, token.startChar),
        char: allowedChars[index],
      }));
    }
  }

  private createDecorations(editor: vscode.TextEditor, debugMode: boolean = false): void {
    this.disposeDecorations();

    const config = vscode.workspace.getConfiguration("vstoys.semantic-jump");

    // Use red background and white text for debug mode
    const backgroundColor = debugMode
      ? "#ff0000"
      : config.get<string>("decorationBackgroundColor", "activityErrorBadge.background");
    const foregroundColor = debugMode
      ? "#ffffff"
      : config.get<string>("decorationForegroundColor", "button.foreground");
    const displayChar = debugMode ? "X" : undefined;

    this.decorationType = vscode.window.createTextEditorDecorationType({
      before: {
        backgroundColor: pickColorType(backgroundColor),
        // border: `1px solid`,
        color: pickColorType(foregroundColor),
        textDecoration: "none;position:absolute;z-index:999999;max-height:100%;",
        contentText: "",
        margin: "0 2px 0 0",
      },
    });

    const decorationOptions: vscode.DecorationOptions[] = this.jumpTargets.map((target) => ({
      range: new vscode.Range(target.position, target.position),
      renderOptions: {
        before: {
          contentText: displayChar || target.char,
        },
      },
    }));

    editor.setDecorations(this.decorationType, decorationOptions);
  }

  private startInput(editor: vscode.TextEditor): void {
    this.jumpInput = new JumpInput({
      textEditor: editor,
      onInput: (input: string, char: string) => this.handleInput(input, char, editor),
      onCancel: () => this.cleanup(),
    });

    const config = vscode.workspace.getConfiguration("vstoys.semantic-jump");
    const allowedChars = config.get<string>("jumpCharacters", "fjdkslaghrueiwoncmvFJDKSLAGHRUEIWONCMV").split("");
    this.jumpInput.changeAllowedChars(allowedChars);
    this.jumpInput.updateStatusBar("Semantic Jump");
  }

  private startDebugMode(editor: vscode.TextEditor): void {
    // Debug mode just shows the decorations without input handling
    // User can press ESC or change editor to exit
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10000);
    statusBarItem.text = `░ Debug Mode: ${this.jumpTargets.length} tokens ░`;
    statusBarItem.show();

    const disposeDebugMode = () => {
      statusBarItem.dispose();
      this.debugModeDisposables.forEach((d) => d.dispose());
      this.debugModeDisposables = [];
      this.cleanup();
    };

    // Auto-cleanup when editor selection changes or editor changes
    this.debugModeDisposables = [
      vscode.window.onDidChangeTextEditorSelection(disposeDebugMode),
      vscode.window.onDidChangeActiveTextEditor(disposeDebugMode),
      vscode.commands.registerCommand("type", ({ text }: { text: string }) => {
        if (text === "\n") {
          disposeDebugMode();
        }
      }),
    ];

    // Clean up disposables after 10 seconds
    setTimeout(() => {
      disposeDebugMode();
    }, 10000);
  }

  private handleInput(input: string, char: string, editor: vscode.TextEditor): void {
    const target = this.jumpTargets.find((t) => t.char === char);
    if (target) {
      editor.selection = new vscode.Selection(target.position, target.position);
      editor.revealRange(new vscode.Range(target.position, target.position));
      this.cleanup();
    }
  }

  private createAdaptiveDecorations(editor: vscode.TextEditor, showOnlySequences?: string): void {
    this.disposeDecorations();

    const config = vscode.workspace.getConfiguration("vstoys.semantic-jump");
    const backgroundColor = config.get<string>("decorationBackgroundColor", "#4169E1");
    const foregroundColor = config.get<string>("decorationForegroundColor", "#ffffff");

    this.decorationType = vscode.window.createTextEditorDecorationType({
      before: {
        backgroundColor: pickColorType(backgroundColor),
        // border: `1px solid`,
        color: pickColorType(foregroundColor),
        textDecoration: "none;position:absolute;z-index:999999;max-height:100%;",
        contentText: "",
        margin: "0 2px 0 0",
      },
    });

    // Filter assignments if we're in refinement phase
    let visibleAssignments = this.jumpAssignments;
    if (showOnlySequences) {
      visibleAssignments = this.jumpAssignments.filter((a) => a.isSequence && a.chars.startsWith(showOnlySequences));
    }

    const decorationOptions: vscode.DecorationOptions[] = visibleAssignments.map((assignment) => {
      // For sequences in refinement phase, only show the second character
      const displayChar =
        showOnlySequences && assignment.isSequence
          ? assignment.chars[1]
          : assignment.isSequence
          ? assignment.chars[0]
          : assignment.chars;

      return {
        range: new vscode.Range(assignment.decorationPosition, assignment.decorationPosition),
        renderOptions: {
          before: {
            contentText: displayChar,
          },
        },
      };
    });

    editor.setDecorations(this.decorationType, decorationOptions);
  }

  private startProgressiveInput(editor: vscode.TextEditor): void {
    this.progressiveInput = new ProgressiveJumpInput(this.jumpAssignments, {
      onJump: (target) => {
        editor.selection = new vscode.Selection(target.position, target.position);
        editor.revealRange(new vscode.Range(target.position, target.position));
        this.cleanup();
      },
      onRefine: (targets) => {
        // Update decorations to show only second characters
        const firstChar = this.progressiveInput?.getFirstChar() || "";
        this.createAdaptiveDecorations(editor, firstChar);
      },
      onCancel: () => {
        this.cleanup();
      },
    });
  }

  private cleanup(): void {
    // Clear context
    vscode.commands.executeCommand("setContext", "vstoys.semantic-jump.active", false);
    vscode.commands.executeCommand("setContext", "vstoys.semantic-jump.targetMode", undefined);

    this.disposeDecorations();
    if (this.jumpInput) {
      this.jumpInput.destroy();
      this.jumpInput = null;
    }
    if (this.progressiveInput) {
      this.progressiveInput.destroy();
      this.progressiveInput = null;
    }
    this.jumpTargets = [];
    this.jumpAssignments = [];

    // Clean up debug mode disposables
    this.debugModeDisposables.forEach((d) => d.dispose());
    this.debugModeDisposables = [];
  }

  public forceCleanup(): void {
    this.cleanup();
  }

  private disposeDecorations(): void {
    if (this.decorationType) {
      this.decorationType.dispose();
      this.decorationType = null;
    }
  }
}
