import * as vscode from "vscode";
import { LabeledMatch, RegularMatchFinder, RegularJumpAssigner } from "./regularJump";

export interface SearchState {
  pattern: string;
  matches: LabeledMatch[];
  currentMatchIndex: number;
  isInJumpMode: boolean;
}

export class ProgressiveSearchInput {
  private disposables: vscode.Disposable[] = [];
  private isActive = false;
  private searchState: SearchState = {
    pattern: "",
    matches: [],
    currentMatchIndex: 0,
    isInJumpMode: false
  };

  private matchFinder = new RegularMatchFinder();
  private jumpAssigner = new RegularJumpAssigner();

  private onJumpCallback?: (match: LabeledMatch) => void;
  private onCancelCallback?: () => void;
  private onUpdateCallback?: (state: SearchState) => void;

  constructor(
    private editor: vscode.TextEditor,
    callbacks: {
      onJump?: (match: LabeledMatch) => void;
      onCancel?: () => void;
      onUpdate?: (state: SearchState) => void;
    } = {}
  ) {
    this.onJumpCallback = callbacks.onJump;
    this.onCancelCallback = callbacks.onCancel;
    this.onUpdateCallback = callbacks.onUpdate;
  }

  /**
   * Start progressive search input
   */
  start(): void {
    if (this.isActive) return;

    this.isActive = true;
    this.searchState = {
      pattern: "",
      matches: [],
      currentMatchIndex: 0,
      isInJumpMode: false
    };

    this.setupInputCapture();
    this.updateState();
  }

  /**
   * Stop and cleanup
   */
  stop(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.disposeAll();
    this.onCancelCallback?.();
  }

  /**
   * Setup keyboard input capture
   */
  private setupInputCapture(): void {
    const inputDisposable = vscode.commands.registerCommand(
      "type",
      (args: { text: string }) => {
        if (!this.isActive) return;

        const char = args.text;

        if (this.searchState.isInJumpMode) {
          this.handleJumpModeInput(char);
        } else {
          this.handleSearchModeInput(char);
        }
      }
    );

    this.disposables.push(inputDisposable);
  }

  /**
   * Handle input during search mode (building pattern)
   */
  private handleSearchModeInput(char: string): void {
    // Build search pattern
    this.searchState.pattern += char;

    // Find matches for current pattern
    const config = vscode.workspace.getConfiguration("vstoys.regular-jump");
    const caseSensitive = config.get<boolean>("caseSensitive", false);
    const maxMatches = config.get<number>("maxMatches", 100);
    const minWordLength = config.get<number>("minWordLength", 0);

    let matches = this.matchFinder.findMatches(
      this.searchState.pattern,
      this.editor,
      caseSensitive
    );

    matches = this.matchFinder.filterMatches(matches, maxMatches, minWordLength);

    this.searchState.matches = this.jumpAssigner.assignJumpChars(
      matches,
      this.editor.selection.active,
      this.editor.document
    );

    // Check if we should transition to jump mode
    const shouldTransitionToJump = this.shouldTransitionToJumpMode();

    if (shouldTransitionToJump && this.searchState.matches.length > 0) {
      this.searchState.isInJumpMode = true;
    }

    this.updateState();
  }

  /**
   * Handle input during jump mode (selecting target)
   */
  private handleJumpModeInput(char: string): void {
    // Find direct single-char matches
    const singleCharMatch = this.searchState.matches.find(
      match => !match.isSequence && match.jumpChar === char
    );

    if (singleCharMatch) {
      this.performJump(singleCharMatch);
      return;
    }

    // Handle first character of sequences
    const sequenceMatches = this.searchState.matches.filter(
      match => match.isSequence && match.jumpChar.startsWith(char)
    );

    if (sequenceMatches.length === 1) {
      // Only one sequence starts with this char, jump immediately
      this.performJump(sequenceMatches[0]);
    } else if (sequenceMatches.length > 1) {
      // Multiple sequences, need second character
      this.waitForSecondChar(char, sequenceMatches);
    }
    // If no matches, ignore the character
  }

  /**
   * Wait for second character in sequence
   */
  private waitForSecondChar(firstChar: string, candidates: LabeledMatch[]): void {
    // Update visual state to show only candidates
    this.searchState.matches = candidates;
    this.updateState();

    // Set up temporary handler for second character
    const secondCharDisposable = vscode.commands.registerCommand(
      "type",
      (args: { text: string }) => {
        const secondChar = args.text;
        const fullSequence = firstChar + secondChar;

        const match = candidates.find(m => m.jumpChar === fullSequence);
        if (match) {
          this.performJump(match);
        }

        // Clean up temporary handler
        secondCharDisposable.dispose();
      }
    );

    // Auto-cleanup after timeout
    setTimeout(() => {
      secondCharDisposable.dispose();
    }, 5000);
  }

  /**
   * Determine if we should transition from search to jump mode
   */
  private shouldTransitionToJumpMode(): boolean {
    const config = vscode.workspace.getConfiguration("vstoys.regular-jump");
    const minPatternLength = config.get<number>("minPatternLength", 2);
    const maxMatchesForAutoJump = config.get<number>("maxMatchesForAutoJump", 20);

    // Minimum pattern length reached
    if (this.searchState.pattern.length < minPatternLength) {
      return false;
    }

    // Have manageable number of matches
    if (this.searchState.matches.length > maxMatchesForAutoJump) {
      return false;
    }

    // Have at least one match
    return this.searchState.matches.length > 0;
  }

  /**
   * Refresh matches for current pattern
   */
  private refreshMatches(): void {
    const config = vscode.workspace.getConfiguration("vstoys.regular-jump");
    const caseSensitive = config.get<boolean>("caseSensitive", false);
    const maxMatches = config.get<number>("maxMatches", 100);
    const minWordLength = config.get<number>("minWordLength", 0);

    let matches = this.matchFinder.findMatches(
      this.searchState.pattern,
      this.editor,
      caseSensitive
    );

    matches = this.matchFinder.filterMatches(matches, maxMatches, minWordLength);

    this.searchState.matches = this.jumpAssigner.assignJumpChars(
      matches,
      this.editor.selection.active,
      this.editor.document
    );

    // Check if we should be in jump mode
    const shouldTransitionToJump = this.shouldTransitionToJumpMode();
    if (shouldTransitionToJump && this.searchState.matches.length > 0) {
      this.searchState.isInJumpMode = true;
    }
  }

  /**
   * Handle backspace key
   */
  handleBackspace(): void {
    if (this.searchState.isInJumpMode) {
      // In jump mode, backspace goes back to search mode
      this.searchState.isInJumpMode = false;
      // Keep current matches and update decorations
      this.updateState();
    } else if (this.searchState.pattern.length > 0) {
      // In search mode, remove last character
      this.searchState.pattern = this.searchState.pattern.slice(0, -1);

      if (this.searchState.pattern.length === 0) {
        this.searchState.matches = [];
      } else {
        // Re-search with the updated pattern
        this.refreshMatches();
      }

      this.updateState();
    } else {
      // Empty pattern, cancel search
      this.stop();
    }
  }

  /**
   * Handle enter key - jump to first/current match
   */
  handleEnter(): void {
    if (this.searchState.matches.length === 0) return;

    const targetMatch = this.searchState.matches[this.searchState.currentMatchIndex] || this.searchState.matches[0];
    this.performJump(targetMatch);
  }

  /**
   * Navigate to next match
   */
  nextMatch(): void {
    if (this.searchState.matches.length === 0) return;

    this.searchState.currentMatchIndex =
      (this.searchState.currentMatchIndex + 1) % this.searchState.matches.length;
    this.updateState();
  }

  /**
   * Navigate to previous match
   */
  previousMatch(): void {
    if (this.searchState.matches.length === 0) return;

    this.searchState.currentMatchIndex =
      (this.searchState.currentMatchIndex - 1 + this.searchState.matches.length) % this.searchState.matches.length;
    this.updateState();
  }

  /**
   * Perform jump to selected match
   */
  private performJump(match: LabeledMatch): void {
    this.isActive = false;
    this.disposeAll();
    this.onJumpCallback?.(match);
  }

  /**
   * Update state and notify callback
   */
  private updateState(): void {
    this.onUpdateCallback?.(this.searchState);
  }

  /**
   * Clean up all disposables
   */
  private disposeAll(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  /**
   * Get current search state
   */
  getState(): SearchState {
    return { ...this.searchState };
  }

  /**
   * Check if currently active
   */
  isSearchActive(): boolean {
    return this.isActive;
  }
}