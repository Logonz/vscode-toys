import { Position, Range, TextDocument } from "vscode";
import { printMotionOutput } from "./main";

// Performance optimization: limit search range for very large files (>50MB)
const FILE_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB in bytes
const SEARCH_RANGE = 100000; // Search ±100k characters around cursor for large files

/**
 * Represents a pair of characters that define a text object boundary.
 * For brackets, open and close are different. For quotes, they're the same.
 */
export interface TextObjectPair {
  open: string;
  close: string;
}

/**
 * Mapping of text object characters to their corresponding open/close pairs.
 * Supports vim-style text objects like parentheses, brackets, braces, quotes, etc.
 * Both opening and closing characters map to the same pair for convenience.
 */
export const TEXT_OBJECTS: Record<string, TextObjectPair> = {
  "(": { open: "(", close: ")" },
  ")": { open: "(", close: ")" },
  "[": { open: "[", close: "]" },
  "]": { open: "[", close: "]" },
  "{": { open: "{", close: "}" },
  "}": { open: "{", close: "}" },
  "<": { open: "<", close: ">" },
  ">": { open: "<", close: ">" },
  '"': { open: '"', close: '"' },
  "'": { open: "'", close: "'" },
  "`": { open: "`", close: "`" },
};

/**
 * Represents the result of finding a text object, containing both inner and outer ranges.
 * - inner: Content inside the delimiters (e.g., "content" for "content")
 * - outer: Content including the delimiters (e.g., "content" for "content")
 */
export interface TextObjectRange {
  inner: Range;
  outer: Range;
}

/**
 * Main entry point for finding text objects at a given position.
 * Handles both quote-based (", ', `) and bracket-based ((, [, {, <) text objects.
 *
 * @param document - The VS Code text document
 * @param position - The cursor position
 * @param textObject - The text object character (e.g., '"', '(', '}')
 * @param count - How many levels outward to expand (default 1)
 * @returns TextObjectRange with inner/outer ranges, or null if not found
 */
export function findTextObject(
  document: TextDocument,
  position: Position,
  textObject: string,
  count: number = 1
): TextObjectRange | null {
  const pair = TEXT_OBJECTS[textObject];
  if (!pair) {
    return null;
  }

  printMotionOutput(`Finding text object for ${count}${textObject} at ${position.line}:${position.character}`);

  const text = document.getText();
  const offset = document.offsetAt(position);

  // Quotes use the same character for open and close, brackets use different characters
  if (pair.open === pair.close) {
    return findQuoteTextObject(document, text, offset, pair.open, count);
  } else {
    return findBracketTextObject(document, text, offset, pair, count);
  }
}

/**
 * Finds bracket-based text objects like (), [], {}, <>.
 * Uses the same logic as findQuoteTextObject: single pass collection and proximity-based pairing.
 * This approach is more reliable than depth tracking and fixes nesting issues.
 *
 * @param document - The VS Code text document
 * @param text - Full document text as string
 * @param offset - Cursor position as character offset
 * @param pair - The bracket pair to search for
 * @param count - How many levels outward to expand
 * @returns TextObjectRange or null if not found
 */
function findBracketTextObject(
  document: TextDocument,
  text: string,
  offset: number,
  pair: TextObjectPair,
  count: number
): TextObjectRange | null {
  const openBracketsBeforeCursor: number[] = [];
  const closeBracketsAfterCursor: number[] = [];

  let searchStart = 0;
  let searchEnd = text.length;

  if (text.length > FILE_SIZE_LIMIT) {
    searchStart = Math.max(0, offset - SEARCH_RANGE);
    searchEnd = Math.min(text.length, offset + SEARCH_RANGE);
  }

  // Single pass: collect opening brackets before cursor and closing brackets after cursor
  for (let i = searchStart; i < searchEnd; i++) {
    if (text[i] === pair.open && i < offset) {
      openBracketsBeforeCursor.push(i);
    } else if (text[i] === pair.close && i >= offset) {
      closeBracketsAfterCursor.push(i);
    }
  }

  // Need at least one bracket on each side to form a pair
  if (openBracketsBeforeCursor.length === 0 || closeBracketsAfterCursor.length === 0) {
    return null;
  }

  // Create pairs by taking brackets from the end of "before" list and start of "after" list
  // This ensures we get the closest brackets to the cursor
  // By using Math.min we ensure balanced pairs are created
  const maxPairs = Math.min(openBracketsBeforeCursor.length, closeBracketsAfterCursor.length);
  const pairs: { openPos: number; closePos: number }[] = [];

  for (let i = 0; i < maxPairs; i++) {
    const openPos = openBracketsBeforeCursor[openBracketsBeforeCursor.length - 1 - i]; // Take from end (closest to cursor)
    const closePos = closeBracketsAfterCursor[i]; // Take from start (closest to cursor)
    pairs.push({ openPos, closePos });
  }

  // Apply count - get the nth pair from cursor outward
  if (count > pairs.length) {
    return null;
  }

  const targetPair = pairs[count - 1]; // count is 1-based, array is 0-based
  const openPos = targetPair.openPos;
  const closePos = targetPair.closePos;

  printMotionOutput(`Found bracket pair: openPos=${openPos}, closePos=${closePos}, pairs=${pairs.length}`);

  // Create ranges for both inner (content only) and outer (including brackets)
  const innerStart = document.positionAt(openPos + 1);
  const innerEnd = document.positionAt(closePos);
  const outerStart = document.positionAt(openPos);
  const outerEnd = document.positionAt(closePos + 1);

  return {
    inner: new Range(innerStart, innerEnd),
    outer: new Range(outerStart, outerEnd),
  };
}

/**
 * Finds quote-based text objects like ", ', `.
 * Handles escaped quotes and finds the quote pair containing the cursor.
 * Falls back to nearest quote pair if cursor is not inside any quotes.
 *
 * @param document - The VS Code text document
 * @param text - Full document text as string
 * @param offset - Cursor position as character offset
 * @param quote - The quote character to search for
 * @param count - How many quote pairs to go outward (for nested scenarios)
 * @returns TextObjectRange or null if not found
 */
function findQuoteTextObject(
  document: TextDocument,
  text: string,
  offset: number,
  quote: string,
  count: number
): TextObjectRange | null {
  const quotesBeforeCursor: number[] = [];
  const quotesAfterCursor: number[] = [];

  let searchStart = 0;
  let searchEnd = text.length;

  if (text.length > FILE_SIZE_LIMIT) {
    searchStart = Math.max(0, offset - SEARCH_RANGE);
    searchEnd = Math.min(text.length, offset + SEARCH_RANGE);
  }

  // Single pass: collect quotes before and after cursor position within search range
  for (let i = searchStart; i < searchEnd; i++) {
    if (text[i] === quote && (i === 0 || text[i - 1] !== "\\")) {
      if (i < offset) {
        quotesBeforeCursor.push(i);
      } else if (i >= offset) {
        quotesAfterCursor.push(i);
      }
    }
  }

  // Need at least one quote on each side to form a pair
  if (quotesBeforeCursor.length === 0 || quotesAfterCursor.length === 0) {
    return null;
  }

  // Create pairs by taking quotes from the end of "before" list and start of "after" list
  // This ensures we get the closest quotes to the cursor
  // By using Math.min we ensure balanced pairs are created
  const maxPairs = Math.min(quotesBeforeCursor.length, quotesAfterCursor.length);
  const pairs: { openPos: number; closePos: number }[] = [];

  for (let i = 0; i < maxPairs; i++) {
    const openPos = quotesBeforeCursor[quotesBeforeCursor.length - 1 - i]; // Take from end (closest to cursor)
    const closePos = quotesAfterCursor[i]; // Take from start (closest to cursor)
    pairs.push({ openPos, closePos });
  }

  // Apply count - get the nth pair from cursor outward
  if (count > pairs.length) {
    return null;
  }

  const targetPair = pairs[count - 1]; // count is 1-based, array is 0-based
  const openPos = targetPair.openPos;
  const closePos = targetPair.closePos;

  printMotionOutput(`Found quote pair: openPos=${openPos}, closePos=${closePos}, pairs=${pairs.length}`);

  // Create ranges for both inner (content only) and outer (including quotes)
  const innerStart = document.positionAt(openPos + 1);
  const innerEnd = document.positionAt(closePos);
  const outerStart = document.positionAt(openPos);
  const outerEnd = document.positionAt(closePos + 1);

  return {
    inner: new Range(innerStart, innerEnd),
    outer: new Range(outerStart, outerEnd),
  };
}
