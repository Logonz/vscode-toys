import { Position, Range, TextDocument } from "vscode";

export interface TextObjectPair {
  open: string;
  close: string;
}

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

export interface TextObjectRange {
  inner: Range;
  outer: Range;
}

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

  const text = document.getText();
  const offset = document.offsetAt(position);

  if (pair.open === pair.close) {
    return findQuoteTextObject(document, text, offset, pair.open, count);
  } else {
    return findBracketTextObject(document, text, offset, pair, count);
  }
}

function findBracketTextObject(
  document: TextDocument,
  text: string,
  offset: number,
  pair: TextObjectPair,
  count: number
): TextObjectRange | null {
  let foundPairs = 0;
  let openPos = -1;
  let closePos = -1;

  for (let attempt = 0; attempt < count; attempt++) {
    const searchStart = attempt === 0 ? offset : openPos > 0 ? openPos - 1 : 0;

    openPos = findMatchingBracket(text, searchStart, pair.open, pair.close, true);
    if (openPos === -1) {
      return null;
    }

    closePos = findMatchingBracket(text, openPos + 1, pair.open, pair.close, false);
    if (closePos === -1) {
      return null;
    }
  }

  if (openPos === -1 || closePos === -1) {
    return null;
  }

  const innerStart = document.positionAt(openPos + 1);
  const innerEnd = document.positionAt(closePos);
  const outerStart = document.positionAt(openPos);
  const outerEnd = document.positionAt(closePos + 1);

  return {
    inner: new Range(innerStart, innerEnd),
    outer: new Range(outerStart, outerEnd),
  };
}

function findQuoteTextObject(
  document: TextDocument,
  text: string,
  offset: number,
  quote: string,
  count: number
): TextObjectRange | null {
  let quotePositions: number[] = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] === quote && (i === 0 || text[i - 1] !== "\\")) {
      quotePositions.push(i);
    }
  }

  if (quotePositions.length < 2) {
    return null;
  }

  let currentQuoteIndex = -1;
  for (let i = 0; i < quotePositions.length; i++) {
    if (quotePositions[i] > offset) {
      currentQuoteIndex = i - 1;
      break;
    }
  }

  if (currentQuoteIndex < 0) {
    currentQuoteIndex = quotePositions.length - 1;
  }

  if (currentQuoteIndex % 2 !== 0) {
    currentQuoteIndex--;
  }

  const targetIndex = Math.max(0, currentQuoteIndex - (count - 1) * 2);

  if (targetIndex + 1 >= quotePositions.length) {
    return null;
  }

  const openPos = quotePositions[targetIndex];
  const closePos = quotePositions[targetIndex + 1];

  const innerStart = document.positionAt(openPos + 1);
  const innerEnd = document.positionAt(closePos);
  const outerStart = document.positionAt(openPos);
  const outerEnd = document.positionAt(closePos + 1);

  return {
    inner: new Range(innerStart, innerEnd),
    outer: new Range(outerStart, outerEnd),
  };
}

function findMatchingBracket(
  text: string,
  startPos: number,
  openChar: string,
  closeChar: string,
  searchBackward: boolean
): number {
  let pos = startPos;
  let depth = 0;
  const step = searchBackward ? -1 : 1;
  const targetChar = searchBackward ? openChar : closeChar;
  const counterChar = searchBackward ? closeChar : openChar;

  while (pos >= 0 && pos < text.length) {
    const char = text[pos];

    if (char === targetChar) {
      if (depth === 0) {
        return pos;
      }
      depth--;
    } else if (char === counterChar) {
      depth++;
    }

    pos += step;
  }

  return -1;
}
