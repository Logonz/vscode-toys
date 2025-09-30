import * as vscode from "vscode";
import { JumpAssignment } from "../shared/adaptiveCharAssigner";

export type JumpAction = {
  type: "jump" | "refine" | "cancel";
  target?: JumpAssignment;
  showTargets?: JumpAssignment[];
};

export class ProgressiveJumpInput {
  private phase: "initial" | "refinement" = "initial";
  private firstChar: string = "";
  private statusBarItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  // Maps for quick lookup
  private singleCharTargets = new Map<string, JumpAssignment>();
  private sequenceFirstChars = new Set<string>();
  private sequenceTargets = new Map<string, JumpAssignment>();

  constructor(
    private assignments: JumpAssignment[],
    private readonly callbacks: {
      onJump: (target: JumpAssignment) => void;
      onRefine: (targets: JumpAssignment[]) => void;
      onCancel: () => void;
    }
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      10000
    );

    this.initializeMaps();
    this.registerInputHandler();
    this.updateStatusBar();
  }

  /**
   * Initialize lookup maps for fast access
   */
  private initializeMaps(): void {
    for (const assignment of this.assignments) {
      if (assignment.isSequence) {
        const firstChar = assignment.chars[0];
        const fullSequence = assignment.chars;

        this.sequenceFirstChars.add(firstChar);
        this.sequenceTargets.set(fullSequence, assignment);
      } else {
        this.singleCharTargets.set(assignment.chars, assignment);
      }
    }
  }

  /**
   * Register the type command handler
   */
  private registerInputHandler(): void {
    this.disposables.push(
      vscode.commands.registerCommand("type", this.handleInput),
      vscode.window.onDidChangeTextEditorSelection(this.cancel),
      vscode.window.onDidChangeActiveTextEditor(this.cancel)
    );
  }

  /**
   * Handle character input
   */
  private handleInput = ({ text }: { text: string }): void => {
    const char = text;

    // Handle cancellation
    if (char === "\n" || char === "Escape") {
      this.cancel();
      return;
    }

    if (this.phase === "initial") {
      this.handleInitialPhase(char);
    } else {
      this.handleRefinementPhase(char);
    }
  };

  /**
   * Handle first character input
   */
  private handleInitialPhase(char: string): void {
    // Check if it's a complete single-character jump
    const singleTarget = this.singleCharTargets.get(char);
    if (singleTarget) {
      this.performJump(singleTarget);
      return;
    }

    // Check if it's the start of a sequence
    if (this.sequenceFirstChars.has(char)) {
      this.firstChar = char;
      this.phase = "refinement";

      // Get all targets that start with this character
      const refinementTargets = this.assignments.filter(
        a => a.isSequence && a.chars.startsWith(char)
      );

      this.callbacks.onRefine(refinementTargets);
      this.updateStatusBar();
      return;
    }

    // Invalid character - could show error or just cancel
    this.cancel();
  }

  /**
   * Handle second character input
   */
  private handleRefinementPhase(char: string): void {
    const fullSequence = this.firstChar + char;
    const target = this.sequenceTargets.get(fullSequence);

    if (target) {
      this.performJump(target);
    } else {
      // Invalid second character - cancel
      this.cancel();
    }
  }

  /**
   * Perform the jump to target
   */
  private performJump(target: JumpAssignment): void {
    this.callbacks.onJump(target);
    this.destroy();
  }

  /**
   * Cancel the jump operation
   */
  private cancel = (): void => {
    this.callbacks.onCancel();
    this.destroy();
  };

  /**
   * Update status bar based on current phase
   */
  private updateStatusBar(): void {
    if (this.phase === "initial") {
      const singleCount = this.singleCharTargets.size;
      const sequenceCount = this.sequenceFirstChars.size;
      this.statusBarItem.text = `░ Jump: ${singleCount} single, ${sequenceCount} sequences ░`;
    } else {
      const availableSecondChars = Array.from(this.sequenceTargets.keys())
        .filter(seq => seq.startsWith(this.firstChar))
        .map(seq => seq[1])
        .join("");
      this.statusBarItem.text = `░ Jump [${this.firstChar}]: ${availableSecondChars} ░`;
    }
    this.statusBarItem.show();
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.statusBarItem.dispose();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  /**
   * Get allowed characters for current phase
   */
  getAllowedChars(): string[] {
    if (this.phase === "initial") {
      const singleChars = Array.from(this.singleCharTargets.keys());
      const firstChars = Array.from(this.sequenceFirstChars);
      return [...singleChars, ...firstChars];
    } else {
      // Get second characters for current first character
      return Array.from(this.sequenceTargets.keys())
        .filter(seq => seq.startsWith(this.firstChar))
        .map(seq => seq[1]);
    }
  }

  /**
   * Get current phase
   */
  getPhase(): "initial" | "refinement" {
    return this.phase;
  }

  /**
   * Get first character (for refinement phase)
   */
  getFirstChar(): string {
    return this.firstChar;
  }
}