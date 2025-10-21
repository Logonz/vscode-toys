import * as vscode from "vscode";

type StatusPhase = "waiting" | "cycling" | "idle";
type MotionKind = "find" | "till";
type MotionDirection = 1 | -1;

export class FromTillStatusBar {
  private item?: vscode.StatusBarItem;
  private phase: StatusPhase = "idle";

  dispose(): void {
    this.clear();
  }

  showWaiting(kind: MotionKind, direction: MotionDirection, select: boolean): void {
    const kindLabel = kind === "find" ? "find" : "till";
    const directionLabel = direction === 1 ? "forward" : "backward";
    const selectLabel = select ? "select" : "jump";
    const text = `from-till: waiting for ${kindLabel} ${selectLabel} char (${directionLabel})`;
    const tooltip = "Press a character to continue the from-till motion.";
    this.show("waiting", text, tooltip);
  }

  updateMode(char: string, select: boolean, currentIndex: number, total: number): void {
    const label = select ? "selecting" : "cycling";
    const index = currentIndex + 1; // Make the display 1-based for humans
    const charDisplay = this.describeChar(char);
    const text = `from-till: ${label} ${charDisplay} (${index} of ${total})`;
    const tooltip = select
      ? "Use navigation keys to adjust the selection, or press Escape to cancel."
      : "Use navigation keys to cycle matches, or press Escape to cancel.";
    this.show("cycling", text, tooltip);
  }

  clear(state?: Exclude<StatusPhase, "idle">): void {
    if (!this.item) {
      return;
    }

    if (state && this.phase !== state) {
      return;
    }

    this.item.dispose();
    this.item = undefined;
    this.phase = "idle";
  }

  private show(state: Exclude<StatusPhase, "idle">, text: string, tooltip?: string): void {
    if (!this.item) {
      this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10000);
    }
    this.phase = state;
    this.item.text = text;
    this.item.tooltip = tooltip;
    this.item.show();
  }

  private describeChar(char: string): string {
    switch (char) {
      case " ":
        return "[space]";
      case "\t":
        return "[tab]";
      case "'":
        return "[apostrophe]";
      case "\"":
        return "[double-quote]";
      default:
        return `'${char}'`;
    }
  }
}
