import * as vscode from "vscode";
import { RegularJumpDecorationManager, LabeledMatch } from "./regularJump";
import { ProgressiveSearchInput, SearchState } from "./progressiveSearchInput";

export class RegularJumpHandler {
  private decorationManager = new RegularJumpDecorationManager();
  private searchInput: ProgressiveSearchInput | null = null;
  private currentEditor: vscode.TextEditor | null = null;
  private isActive = false;
  private statusBarItem: vscode.StatusBarItem;

  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10000);
  }

  /**
   * Start regular jump mode
   */
  async startRegularJump(editor: vscode.TextEditor): Promise<void> {
    if (this.isActive) {
      this.cancelRegularJump();
    }

    this.currentEditor = editor;
    this.isActive = true;

    // Set context for keybindings
    await vscode.commands.executeCommand("setContext", "vstoys.regular-jump.active", true);

    // Initialize decoration manager
    const config = vscode.workspace.getConfiguration("vstoys.regular-jump");
    this.decorationManager.createDecorationTypes(config);

    // Start search input
    this.searchInput = new ProgressiveSearchInput(editor, {
      onJump: (match) => this.handleJump(match),
      onCancel: () => this.cancelRegularJump(),
      onUpdate: (state) => this.handleStateUpdate(state),
    });

    this.searchInput.start();

    // Do not allow text selection changes, cancel jump
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor === this.currentEditor) {
          this.cancelRegularJump();
        }
      })
    );

    // Do not allow active editor changes, cancel jump
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor !== this.currentEditor) {
          this.cancelRegularJump();
        }
      })
    );

    // Do not allow changing of windows, cancel jump
    this.disposables.push(
      vscode.window.onDidChangeWindowState((event) => {
        if (!event.focused) {
          this.cancelRegularJump();
        }
      })
    );

    // Show initial status
    this.showStatusMessage("Regular Jump: Start typing to search...");
  }

  /**
   * Cancel regular jump mode
   */
  async cancelRegularJump(): Promise<void> {
    if (!this.isActive) return;

    this.isActive = false;

    // Clear decorations
    if (this.currentEditor) {
      this.decorationManager.clearDecorations(this.currentEditor);
    }

    // Stop search input
    if (this.searchInput) {
      this.searchInput.stop();
      this.searchInput = null;
    }

    // Clear context
    await vscode.commands.executeCommand("setContext", "vstoys.regular-jump.active", false);

    // Dispose decorations
    this.decorationManager.disposeDecorations();

    // Dispose event listeners
    this.disposables.forEach((disposable) => disposable.dispose());
    this.disposables = [];

    this.currentEditor = null;
    this.hideStatusMessage();
  }

  /**
   * Handle jump to selected match
   */
  private async handleJump(match: LabeledMatch): Promise<void> {
    if (!this.currentEditor) return;

    // Move cursor to match position
    const position = new vscode.Position(match.line, match.startChar);
    this.currentEditor.selection = new vscode.Selection(position, position);

    // Reveal position in editor
    this.currentEditor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );

    // Clean up
    await this.cancelRegularJump();
  }

  /**
   * Handle search state updates
   */
  private handleStateUpdate(state: SearchState): void {
    if (!this.currentEditor) return;

    // Update decorations
    if (state.matches.length > 0) {
      this.decorationManager.applyDecorations(
        this.currentEditor,
        state.matches,
        state.pattern,
        state.currentMatchIndex
      );
    } else {
      this.decorationManager.clearDecorations(this.currentEditor);
    }

    // Update status message
    this.updateStatusMessage(state);
  }

  /**
   * Update status bar message based on current state
   */
  private updateStatusMessage(state: SearchState): void {
    if (state.isInJumpMode) {
      if (state.matches.length === 0) {
        this.showStatusMessage("Regular Jump: No matches found");
      } else {
        this.showStatusMessage(
          `Regular Jump: "${state.pattern}" → ${state.matches.length} matches - Press jump character`
        );
      }
    } else {
      if (state.pattern.length === 0) {
        this.showStatusMessage("Regular Jump: Start typing to search...");
      } else if (state.matches.length === 0) {
        this.showStatusMessage(`Regular Jump: "${state.pattern}" - No matches`);
      } else {
        this.showStatusMessage(
          `Regular Jump: "${state.pattern}" → ${state.matches.length} matches - Keep typing or press Enter`
        );
      }
    }
  }

  /**
   * Navigate to next match
   */
  async nextMatch(): Promise<void> {
    if (!this.searchInput?.isSearchActive()) return;
    this.searchInput.nextMatch();
  }

  /**
   * Navigate to previous match
   */
  async previousMatch(): Promise<void> {
    if (!this.searchInput?.isSearchActive()) return;
    this.searchInput.previousMatch();
  }

  /**
   * Handle backspace
   */
  async backspace(): Promise<void> {
    if (!this.searchInput?.isSearchActive()) return;
    this.searchInput.handleBackspace();
  }

  /**
   * Handle enter key
   */
  async enter(): Promise<void> {
    if (!this.searchInput?.isSearchActive()) return;
    this.searchInput.handleEnter();
  }

  /**
   * Show status bar message
   */
  private showStatusMessage(message: string): void {
    this.statusBarItem.text = message;
    this.statusBarItem.show();
  }

  /**
   * Hide status bar message
   */
  private hideStatusMessage(): void {
    this.statusBarItem.hide();
  }

  /**
   * Check if regular jump is currently active
   */
  isJumpActive(): boolean {
    return this.isActive;
  }

  /**
   * Get current search state (for debugging)
   */
  getCurrentState(): SearchState | null {
    return this.searchInput?.getState() ?? null;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.cancelRegularJump();
    this.statusBarItem.dispose();
  }
}
