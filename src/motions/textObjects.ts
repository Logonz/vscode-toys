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
  i: { open: "auto", close: "auto" },
  a: { open: "auto", close: "auto" },
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
 * Represents a found text object pair with position and distance information.
 */
interface TextObjectPairInfo {
  openPos: number;
  closePos: number;
  distance: number;
}

/**
 * Helper function to calculate search range for performance optimization.
 */
function getSearchRange(text: string, offset: number): { searchStart: number; searchEnd: number } {
  let searchStart = 0;
  let searchEnd = text.length;

  if (text.length > FILE_SIZE_LIMIT) {
    searchStart = Math.max(0, offset - SEARCH_RANGE);
    searchEnd = Math.min(text.length, offset + SEARCH_RANGE);
  }

  return { searchStart, searchEnd };
}

/**
 * Helper function to find all valid bracket pairs that contain the cursor.
 * Uses proper bracket matching with depth tracking.
 */
function findBracketPairs(
  text: string,
  offset: number,
  pair: TextObjectPair,
  searchStart: number,
  searchEnd: number
): TextObjectPairInfo[] {
  const validPairs: TextObjectPairInfo[] = [];

  // For each opening bracket before the cursor, find its matching closing bracket
  for (let openPos = searchStart; openPos < offset; openPos++) {
    if (text[openPos] !== pair.open) {
      continue;
    }

    // Find the matching closing bracket by tracking depth
    let depth = 1;
    let closePos = -1;

    for (let i = openPos + 1; i < searchEnd; i++) {
      if (text[i] === pair.open) {
        depth++;
      } else if (text[i] === pair.close) {
        depth--;
        if (depth === 0) {
          closePos = i;
          break;
        }
      }
    }

    // Only consider this pair if:
    // 1. We found a matching closing bracket
    // 2. The cursor is between the brackets (inside the pair)
    if (closePos !== -1 && offset >= openPos && offset <= closePos) {
      const distance = Math.min(Math.abs(offset - openPos), Math.abs(offset - closePos));
      validPairs.push({ openPos, closePos, distance });
    }
  }

  return validPairs;
}

/**
 * Helper function to find all valid quote pairs that contain the cursor.
 * Uses proper quote state tracking to handle quote pairing correctly.
 */
function findQuotePairs(
  text: string,
  offset: number,
  quote: string,
  searchStart: number,
  searchEnd: number
): TextObjectPairInfo[] {
  const validPairs: TextObjectPairInfo[] = [];

  // Scan for quote pairs by tracking quote state
  let insideQuotes = false;
  let currentOpenPos = -1;

  for (let i = searchStart; i < searchEnd; i++) {
    // Skip escaped quotes
    if (text[i] === quote && (i === 0 || text[i - 1] !== "\\")) {
      if (!insideQuotes) {
        // This is an opening quote
        insideQuotes = true;
        currentOpenPos = i;
      } else {
        // This is a closing quote
        insideQuotes = false;
        const closePos = i;

        // Only consider this pair if the cursor is between the quotes (inside the pair)
        if (offset > currentOpenPos && offset < closePos) {
          const distance = Math.min(Math.abs(offset - currentOpenPos), Math.abs(offset - closePos));
          validPairs.push({ openPos: currentOpenPos, closePos, distance });
        }

        currentOpenPos = -1;
      }
    }
  }

  return validPairs;
}

/**
 * Helper function to create TextObjectRange from pair positions.
 */
function createTextObjectRange(document: TextDocument, openPos: number, closePos: number): TextObjectRange {
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
  const { searchStart, searchEnd } = getSearchRange(text, offset);

  // Handle automatic text object selection
  if (pair.open === "auto" && pair.close === "auto") {
    return findAnyTextObject(document, text, offset, count);
  }

  let validPairs: TextObjectPairInfo[];
  let pairType: string;

  // Find pairs based on text object type
  if (pair.open === pair.close) {
    // Quote-based text object
    validPairs = findQuotePairs(text, offset, pair.open, searchStart, searchEnd);
    pairType = "quote";
  } else {
    // Bracket-based text object
    validPairs = findBracketPairs(text, offset, pair, searchStart, searchEnd);
    pairType = "bracket";
  }

  if (validPairs.length === 0) {
    return null;
  }

  // Sort by distance to cursor (closest first), then by opening position for consistency
  validPairs.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    // If distances are equal, prefer the inner pair (larger opening position)
    return b.openPos - a.openPos;
  });

  // Apply count - get the nth pair from cursor outward
  if (count > validPairs.length) {
    return null;
  }

  const targetPair = validPairs[count - 1]; // count is 1-based, array is 0-based

  printMotionOutput(
    `Found ${pairType} pair: openPos=${targetPair.openPos}, closePos=${targetPair.closePos}, pairs=${validPairs.length}`
  );

  return createTextObjectRange(document, targetPair.openPos, targetPair.closePos);
}

/**
 * Finds all supported text objects at a given position and returns them sorted by proximity to cursor.
 * Works like findQuoteTextObject but for ANY text object type - finds the closest, then next closest, etc.
 * This enables "automatic" text object selection where 'a' means "any closest text object".
 *
 * @param document - The VS Code text document
 * @param text - Full document text as string
 * @param offset - Cursor position as character offset
 * @param count - How many levels outward to expand (default 1)
 * @param textObjects - The text object definitions to search for (defaults to TEXT_OBJECTS)
 * @returns TextObjectRange The found text object range at the specified count level, or null if none found
 */
export function findAnyTextObject(
  document: TextDocument,
  text: string,
  offset: number,
  count: number = 1,
  textObjects: Record<string, TextObjectPair> = TEXT_OBJECTS
): TextObjectRange | null {
  printMotionOutput(`Finding automatic text object ${count} at offset ${offset}`);

  const { searchStart, searchEnd } = getSearchRange(text, offset);

  // Group text objects by their behavior: quotes vs brackets
  const quoteChars = new Set<string>();
  const bracketPairs = new Map<string, TextObjectPair>();

  for (const [char, pair] of Object.entries(textObjects)) {
    if (pair.open === pair.close) {
      quoteChars.add(pair.open);
    } else {
      // Use opening character as key to avoid duplicates
      bracketPairs.set(pair.open, pair);
    }
  }

  // Collect all possible text object pairs with their types
  interface TextObjectCandidate {
    openPos: number;
    closePos: number;
    type: string;
    distanceToClosest: number;
  }

  const allCandidates: TextObjectCandidate[] = [];

  // Process quotes using helper function
  for (const quoteChar of quoteChars) {
    const quotePairs = findQuotePairs(text, offset, quoteChar, searchStart, searchEnd);

    for (const pair of quotePairs) {
      allCandidates.push({
        openPos: pair.openPos,
        closePos: pair.closePos,
        type: quoteChar,
        distanceToClosest: pair.distance,
      });
    }
  }

  // Process bracket pairs using helper function
  for (const [openChar, pair] of bracketPairs) {
    const bracketPairs = findBracketPairs(text, offset, pair, searchStart, searchEnd);

    for (const bracketPair of bracketPairs) {
      allCandidates.push({
        openPos: bracketPair.openPos,
        closePos: bracketPair.closePos,
        type: openChar,
        distanceToClosest: bracketPair.distance,
      });
    }
  }

  if (allCandidates.length === 0) {
    return null;
  }

  // Sort by distance to cursor (closest first), then by opening position for consistency
  allCandidates.sort((a, b) => {
    if (a.distanceToClosest !== b.distanceToClosest) {
      return a.distanceToClosest - b.distanceToClosest;
    }
    // If distances are equal, prefer the one with the opening position closer to cursor
    return Math.abs(offset - a.openPos) - Math.abs(offset - b.openPos);
  });

  // Apply count - get the nth closest text object
  if (count > allCandidates.length) {
    return null;
  }

  const targetCandidate = allCandidates[count - 1]; // count is 1-based, array is 0-based

  printMotionOutput(
    `Found automatic text object: type=${targetCandidate.type}, openPos=${targetCandidate.openPos}, closePos=${targetCandidate.closePos}, distance=${targetCandidate.distanceToClosest}, total=${allCandidates.length}`
  );

  return createTextObjectRange(document, targetCandidate.openPos, targetCandidate.closePos);
}
