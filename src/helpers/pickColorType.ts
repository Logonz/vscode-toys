import * as vscode from "vscode";

/**
 * Determines whether a color string is a hex color or a theme color ID.
 * @param inputColor Takes a theme ID (like `editor.background`, `errorForeground`) or hex color string (like `#ffffff`, `fff`)
 * @returns vscode.ThemeColor for theme IDs, or the original string for hex colors
 */
export function pickColorType(inputColor: string): vscode.ThemeColor | string {
  // Trim whitespace and convert to lowercase for consistent checking
  const trimmedColor = inputColor.trim();

  // Check if it's a hex color (with or without #)
  if (isHexColor(trimmedColor)) {
    // Return the original string (preserve case and # prefix if present)
    return inputColor;
  }

  // If it's not a hex color, treat it as a theme color
  return new vscode.ThemeColor(inputColor);
}

/**
 * Checks if a string represents a valid hex color.
 * Supports formats: #fff, #ffffff, #ffff, #ffffffff, fff, ffffff, etc.
 */
function isHexColor(color: string): boolean {
  // Remove # if present
  const cleanColor = color.startsWith("#") ? color.slice(1) : color;

  // Check if it's a valid hex string (only contains 0-9, a-f, A-F)
  if (!/^[0-9a-fA-F]+$/.test(cleanColor)) {
    return false;
  }

  // Check if it's a valid hex color length (3, 4, 6, or 8 characters)
  const validLengths = [3, 4, 6, 8];
  return validLengths.includes(cleanColor.length);
}
