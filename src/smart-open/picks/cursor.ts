import * as vscode from "vscode";

// Cursor character mapping based on VS Code cursor style
// | - Classic thin vertical line (most common)
// ▎ - Thin block (modern, sleek)
// ▏ - Very thin block (minimal)
// ▌ - Half block (visible but not too wide)
// _ - Underscore (what you're currently using, traditional terminal style)
// ▁ - Low underscore (subtle, less intrusive)
// █ - Full block (very visible, bold)
const cursorLookup: Record<string, string> = {
  line: "▏",
  block: "█",
  underline: "_",
  "line-thin": "▏",
  "block-outline": "🮰", // This is not supported :(
  // "block-outline": "█",
  "underline-thin": "_",
};

// Function to get the current cursor character from VS Code settings
export function getCursorCharFromSettings(): string {
  const config = vscode.workspace.getConfiguration("editor");
  const cursorStyle = config.get<string>("cursorStyle", "line");
  return cursorLookup[cursorStyle] || "▏"; // Default to line if not found
}

export function getCursorBlinkingSetting(): boolean {
  const config = vscode.workspace.getConfiguration("editor");
  const cursorBlinking = config.get<string>("cursorBlinking", "blink");
  return cursorBlinking !== "solid"; // If solid, no blinking
}
