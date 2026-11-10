/**
 * Maps line numbers between two versions of a file, so a cursor placed in an old revision (a diff's
 * HEAD side, a commit, another branch) lands on the same code in the current file.
 */

/**
 * Above this many inserted plus deleted lines the versions are treated as unrelated: mapping
 * through a rewrite is meaningless, and the diff's cost grows with this number.
 */
const MAX_EDIT_DISTANCE = 1000;

/**
 * Creates a function that maps a 0-based line in `beforeLines` to its 0-based line in `afterLines`.
 *
 * Unchanged lines map exactly. A deleted or rewritten line maps to the line now in its place.
 * Versions too different to diff keep the line number, clamped to `afterLines`.
 */
export function createLineMapper(
  beforeLines: readonly string[],
  afterLines: readonly string[]
): (beforeLine: number) => number {
  // Most edits are local: match the common prefix and suffix directly and only diff the middle.
  const shorterLength = Math.min(beforeLines.length, afterLines.length);
  let prefixLength = 0;
  while (prefixLength < shorterLength && beforeLines[prefixLength] === afterLines[prefixLength]) {
    prefixLength++;
  }
  let suffixLength = 0;
  while (
    suffixLength < shorterLength - prefixLength &&
    beforeLines[beforeLines.length - 1 - suffixLength] === afterLines[afterLines.length - 1 - suffixLength]
  ) {
    suffixLength++;
  }

  const beforeMiddle = beforeLines.slice(prefixLength, beforeLines.length - suffixLength);
  const afterMiddle = afterLines.slice(prefixLength, afterLines.length - suffixLength);
  const middleMap = diffLineMap(beforeMiddle, afterMiddle);
  const lastAfterLine = Math.max(afterLines.length - 1, 0);

  return (beforeLine) => {
    let afterLine: number;
    if (beforeLine < prefixLength) {
      afterLine = beforeLine;
    } else if (beforeLine >= beforeLines.length - suffixLength) {
      afterLine = beforeLine + afterLines.length - beforeLines.length;
    } else {
      afterLine = prefixLength + (middleMap ? middleMap[beforeLine - prefixLength] : beforeLine - prefixLength);
    }
    return Math.min(Math.max(afterLine, 0), lastAfterLine);
  };
}

/**
 * Myers diff over whole lines: returns, for each index of `a`, its index in `b` (for a deleted line,
 * the index where it would sit), or `undefined` when more than MAX_EDIT_DISTANCE edits are needed.
 *
 * Follows the forward search with backtracking from https://blog.jcoglan.com/2017/02/12/the-myers-diff-algorithm-part-1/
 * `furthestX[offset + k]` is the furthest x reached on diagonal k = x - y.
 */
function diffLineMap(a: readonly string[], b: readonly string[]): Int32Array | undefined {
  const lineMap = new Int32Array(a.length);
  if (a.length === 0 || b.length === 0) {
    return lineMap; // Pure insertion or pure deletion: every line of `a` sits at index 0 of `b`.
  }

  const maxEdits = Math.min(a.length + b.length, MAX_EDIT_DISTANCE);
  const offset = maxEdits + 1;
  const furthestX = new Int32Array(2 * maxEdits + 3);
  // furthestX as it was before each round; backtracking replays the choices from these.
  const history: Int32Array[] = [];

  for (let edits = 0; edits <= maxEdits; edits++) {
    history.push(furthestX.slice());
    for (let k = -edits; k <= edits; k += 2) {
      const cameFromInsertion = k === -edits || (k !== edits && furthestX[offset + k - 1] < furthestX[offset + k + 1]);
      let x = cameFromInsertion ? furthestX[offset + k + 1] : furthestX[offset + k - 1] + 1;
      let y = x - k;
      while (x < a.length && y < b.length && a[x] === b[y]) {
        x++;
        y++;
      }
      furthestX[offset + k] = x;
      if (x >= a.length && y >= b.length) {
        fillFromHistory(lineMap, history, offset, a.length, b.length);
        return lineMap;
      }
    }
  }
  return undefined;
}

/** Walks the shortest edit path back from the end, recording where each line of `a` landed in `b`. */
function fillFromHistory(
  lineMap: Int32Array,
  history: readonly Int32Array[],
  offset: number,
  aLength: number,
  bLength: number
): void {
  let x = aLength;
  let y = bLength;
  for (let edits = history.length - 1; edits >= 0; edits--) {
    const furthestX = history[edits];
    const k = x - y;
    const cameFromInsertion = k === -edits || (k !== edits && furthestX[offset + k - 1] < furthestX[offset + k + 1]);
    const previousK = cameFromInsertion ? k + 1 : k - 1;
    const previousX = edits === 0 ? 0 : furthestX[offset + previousK];
    const previousY = edits === 0 ? 0 : previousX - previousK;

    // The diagonal run of equal lines that ended this round.
    while (x > previousX && y > previousY) {
      x--;
      y--;
      lineMap[x] = y;
    }
    if (edits > 0 && !cameFromInsertion) {
      lineMap[x - 1] = y; // a[x - 1] was deleted here; the line now in its place is b[y].
    }
    x = previousX;
    y = previousY;
  }
}
