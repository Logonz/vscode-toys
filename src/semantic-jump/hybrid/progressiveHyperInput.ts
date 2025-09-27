import * as vscode from "vscode";
import { LabeledMatch, HybridMatchFinder, HybridJumpAssigner, HybridMatch } from "./hybridJump";

export interface SearchState {
  pattern: string;
  matches: LabeledMatch[];
  currentMatchIndex: number;
  isInJumpMode: boolean;
  isWaitingForSecondChar: boolean;
  firstChar: string;
}

export class ProgressiveSearchInput {
  private disposables: vscode.Disposable[] = [];
  private isActive = false;
  private searchState: SearchState = {
    pattern: "",
    matches: [],
    currentMatchIndex: 0,
    isInJumpMode: false,
    isWaitingForSecondChar: false,
    firstChar: "",
  };

  private matchFinder = new HybridMatchFinder();
  private jumpAssigner = new HybridJumpAssigner();

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
      isInJumpMode: false,
      isWaitingForSecondChar: false,
      firstChar: "",
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
    const inputDisposable = vscode.commands.registerCommand("type", (args: { text: string }) => {
      if (!this.isActive) {
        // If not active, execute the default type command
        return vscode.commands.executeCommand("default:type", args);
      }

      const char = args.text;

      if (this.searchState.isWaitingForSecondChar) {
        this.handleSecondCharInput(char);
        return;
      } else if (this.searchState.isInJumpMode) {
        this.handleJumpModeInput(char);
        return;
      } else {
        this.handleSearchModeInput(char);
        return;
      }
    });

    this.disposables.push(inputDisposable);
  }

  /**
   * Handle input during search mode (building pattern)
   */
  private handleSearchModeInput(char: string): void {
    // Build search pattern
    this.searchState.pattern += char;

    // Find matches for current pattern
    const config = vscode.workspace.getConfiguration("vstoys.hybrid-jump");
    const caseSensitive = config.get<boolean>("caseSensitive", false);
    const maxMatches = config.get<number>("maxMatches", 100);
    const minWordLength = config.get<number>("minWordLength", 0);
    const autoJumpSingleMatch = config.get<boolean>("autoJumpSingleMatch", true);

    let matches = this.matchFinder.findMatches(this.searchState.pattern, this.editor, caseSensitive);

    matches = this.matchFinder.filterMatches(matches, maxMatches, minWordLength);

    // Get excluded characters for hybrid mode (pattern continuation always enabled)
    const excludedChars = this.getNextPossibleCharactersFromMatches(matches);

    this.searchState.matches = this.jumpAssigner.assignJumpChars(
      matches,
      this.editor.selection.active,
      this.editor.document,
      excludedChars
    );

    // Auto-jump if only one match remains
    if (autoJumpSingleMatch && this.searchState.matches.length === 1) {
      this.performJump(this.searchState.matches[0]);
      return;
    }

    // Check if we should transition to jump mode
    const shouldTransitionToJump = this.shouldTransitionToJumpMode();

    if (shouldTransitionToJump && this.searchState.matches.length > 0) {
      this.searchState.isInJumpMode = true;
    }

    this.updateState();
  }

  /**
   * Handle second character input for sequence matches
   */
  private handleSecondCharInput(char: string): void {
    const fullSequence = this.searchState.firstChar + char;
    const match = this.searchState.matches.find((m) => m.jumpChar === fullSequence);

    if (match) {
      this.performJump(match);
    } else {
      // No match found, exit waiting state and go back to normal jump mode
      this.searchState.isWaitingForSecondChar = false;
      this.searchState.firstChar = "";
      // Restore original matches (before filtering for second char)
      this.refreshMatches();
    }
  }

  /**
   * Handle input during jump mode (selecting target)
   */
  private handleJumpModeInput(char: string): void {
    // HYBRID MODE: Check if we should continue pattern instead of jumping
    if (this.shouldContinuePattern(char)) {
      this.continueSearchPattern(char);
      return;
    }

    // Find direct single-char matches
    const singleCharMatch = this.searchState.matches.find((match) => !match.isSequence && match.jumpChar === char);

    if (singleCharMatch) {
      this.performJump(singleCharMatch);
      return;
    }

    // Handle first character of sequences
    const sequenceMatches = this.searchState.matches.filter(
      (match) => match.isSequence && match.jumpChar.startsWith(char)
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
   * Continue search pattern instead of jumping
   */
  private continueSearchPattern(char: string): void {
    // Switch back to search mode and continue building pattern
    this.searchState.isInJumpMode = false;
    this.searchState.pattern += char;

    // Find new matches with extended pattern
    const config = vscode.workspace.getConfiguration("vstoys.hybrid-jump");
    const caseSensitive = config.get<boolean>("caseSensitive", false);
    const maxMatches = config.get<number>("maxMatches", 100);
    const minWordLength = config.get<number>("minWordLength", 0);
    const autoJumpSingleMatch = config.get<boolean>("autoJumpSingleMatch", true);

    let matches = this.matchFinder.findMatches(this.searchState.pattern, this.editor, caseSensitive);
    matches = this.matchFinder.filterMatches(matches, maxMatches, minWordLength);

    // Get excluded characters for hybrid mode (pattern continuation always enabled)
    const excludedChars = this.getNextPossibleCharactersFromMatches(matches);

    this.searchState.matches = this.jumpAssigner.assignJumpChars(
      matches,
      this.editor.selection.active,
      this.editor.document,
      excludedChars
    );

    // Auto-jump if only one match remains
    if (autoJumpSingleMatch && this.searchState.matches.length === 1) {
      this.performJump(this.searchState.matches[0]);
      return;
    }

    // Check if we should transition back to jump mode
    const shouldTransitionToJump = this.shouldTransitionToJumpMode();
    if (shouldTransitionToJump && this.searchState.matches.length > 0) {
      this.searchState.isInJumpMode = true;
    }

    this.updateState();
  }

  /**
   * Wait for second character in sequence
   */
  private waitForSecondChar(firstChar: string, candidates: LabeledMatch[]): void {
    // Update state to wait for second character
    this.searchState.isWaitingForSecondChar = true;
    this.searchState.firstChar = firstChar;
    this.searchState.matches = candidates;
    this.updateState();
  }

  /**
   * Determine if we should transition from search to jump mode
   */
  private shouldTransitionToJumpMode(): boolean {
    const config = vscode.workspace.getConfiguration("vstoys.hybrid-jump");
    const minPatternLength = config.get<number>("minPatternLength", 3);
    const maxMatchesForAutoJump = config.get<number>("maxMatchesForAutoJump", 30);

    // Minimum pattern length reached
    if (this.searchState.pattern.length < minPatternLength) {
      return false;
    }

    // Have manageable number of matches
    if (this.searchState.matches.length > maxMatchesForAutoJump) {
      return false;
    }

    // Have at least one match
    if (this.searchState.matches.length === 0) {
      return false;
    }

    // Check for character conflicts (pattern continuation always enabled in hybrid mode)
    if (this.hasJumpCharacterConflicts()) {
      return false;
    }

    return true;
  }

  /**
   * Check if there are conflicts between potential jump characters and next characters
   */
  private hasJumpCharacterConflicts(): boolean {
    // We need to check against the raw matches before jump character assignment
    const config = vscode.workspace.getConfiguration("vstoys.hybrid-jump");
    const caseSensitive = config.get<boolean>("caseSensitive", false);
    const maxMatches = config.get<number>("maxMatches", 100);
    const minWordLength = config.get<number>("minWordLength", 0);

    let matches = this.matchFinder.findMatches(this.searchState.pattern, this.editor, caseSensitive);
    matches = this.matchFinder.filterMatches(matches, maxMatches, minWordLength);

    const nextChars = this.getNextPossibleCharactersFromMatches(matches);
    const availableJumpChars = this.getAvailableJumpChars(nextChars);

    // Need at least enough jump characters for all matches
    return availableJumpChars.size < matches.length;
  }

  /**
   * Get all possible next characters from given matches
   */
  private getNextPossibleCharactersFromMatches(matches: HybridMatch[]): Set<string> {
    const nextChars = new Set<string>();

    matches.forEach((match) => {
      if (match.nextChar && /\w/.test(match.nextChar)) {
        nextChars.add(match.nextChar.toLowerCase());
      }
    });

    return nextChars;
  }

  /**
   * Get all possible next characters from current matches
   */
  private getNextPossibleCharacters(): Set<string> {
    return this.getNextPossibleCharactersFromMatches(this.searchState.matches);
  }

  /**
   * Get available jump characters excluding conflicting ones
   */
  private getAvailableJumpChars(excludedChars: Set<string>): Set<string> {
    const config = vscode.workspace.getConfiguration("vstoys.hybrid-jump");
    const jumpCharacters = config.get<string>("jumpCharacters", "fjdkslaghrueiwoncmvFJDKSLAGHRUEIWONCMV");
    const allChars = new Set(jumpCharacters.toLowerCase().split(""));
    const available = new Set<string>();

    for (const char of allChars) {
      if (!excludedChars.has(char)) {
        available.add(char);
      }
    }

    return available;
  }

  /**
   * Check if typing this character should continue the pattern instead of jumping
   * In hybrid mode, pattern continuation is always enabled
   */
  private shouldContinuePattern(char: string): boolean {
    // Check if this character is a possible next character for any match
    const nextChars = this.getNextPossibleCharacters();
    if (!nextChars.has(char.toLowerCase())) {
      return false;
    }

    // Test if continuing would still yield matches
    const testPattern = this.searchState.pattern + char;
    const config = vscode.workspace.getConfiguration("vstoys.hybrid-jump");
    const caseSensitive = config.get<boolean>("caseSensitive", false);
    const matches = this.matchFinder.findMatches(testPattern, this.editor, caseSensitive);

    return matches.length > 0;
  }

  /**
   * Refresh matches for current pattern
   */
  private refreshMatches(): void {
    const config = vscode.workspace.getConfiguration("vstoys.hybrid-jump");
    const caseSensitive = config.get<boolean>("caseSensitive", false);
    const maxMatches = config.get<number>("maxMatches", 100);
    const minWordLength = config.get<number>("minWordLength", 0);

    let matches = this.matchFinder.findMatches(this.searchState.pattern, this.editor, caseSensitive);

    matches = this.matchFinder.filterMatches(matches, maxMatches, minWordLength);

    // Get excluded characters for hybrid mode (pattern continuation always enabled)
    const excludedChars = this.getNextPossibleCharactersFromMatches(matches);

    this.searchState.matches = this.jumpAssigner.assignJumpChars(
      matches,
      this.editor.selection.active,
      this.editor.document,
      excludedChars
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
    if (this.searchState.isWaitingForSecondChar) {
      // In waiting for second char mode, go back to normal jump mode
      this.searchState.isWaitingForSecondChar = false;
      this.searchState.firstChar = "";
      // Restore original matches
      this.refreshMatches();
      this.updateState();
    } else if (this.searchState.isInJumpMode) {
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

    this.searchState.currentMatchIndex = (this.searchState.currentMatchIndex + 1) % this.searchState.matches.length;
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
    this.disposables.forEach((d) => d.dispose());
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
