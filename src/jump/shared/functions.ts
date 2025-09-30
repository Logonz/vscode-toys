import * as vscode from "vscode";
import { BaseMatch } from "./types";

/**
 * Classify match type for priority scoring
 */
export function classifyMatchType(match: BaseMatch, document: vscode.TextDocument): string {
  // Simple heuristics for match classification
  if (isAtWordStart(match, document)) {
    if (/^[A-Z]/.test(match.text)) {
      return "class"; // Likely class or type name
    }
    if (/^[a-z_][a-zA-Z0-9_]*$/.test(match.text)) {
      return "variable"; // Likely variable name
    }
  }

  return "property"; // Default to medium priority
}

function isAtWordStart(match: BaseMatch, document: vscode.TextDocument): boolean {
  const line = document.lineAt(match.line).text;
  const charBefore = match.startChar > 0 ? line[match.startChar - 1] : " ";
  return /\s|[^\w]/.test(charBefore);
}

/**
 * Check if match is at word boundary
 * ! Unused
 */
export function isAtWordBoundary(match: BaseMatch, document: vscode.TextDocument): boolean {
  const line = document.lineAt(match.line).text;

  // Check character before match
  const charBefore = match.startChar > 0 ? line[match.startChar - 1] : " ";
  const charAfter = match.endChar < line.length ? line[match.endChar] : " ";

  return isWordBoundaryChar(charBefore) && isWordBoundaryChar(charAfter);
}

function isWordBoundaryChar(char: string): boolean {
  // Word boundary characters: whitespace, punctuation, start/end of line
  return /\s|[^\w]/.test(char);
}
