/**
 * fzy's match scoring (https://github.com/jhawthorn/fzy), with scores scaled by 1000.
 *
 * A matched character earns a bonus when it starts a path segment, a word or a camelCase hump,
 * consecutive matches earn the most, and every skipped character costs a little.
 */

const SCORE_GAP_LEADING = -5;
const SCORE_GAP_TRAILING = -5;
const SCORE_GAP_INNER = -10;
const SCORE_MATCH_CONSECUTIVE = 1000;
const SCORE_MATCH_SLASH = 900;
const SCORE_MATCH_WORD = 800;
const SCORE_MATCH_CAPITAL = 700;
const SCORE_MATCH_DOT = 600;

/** Longer haystacks are not scored (as in fzy); they still match, with quality 0. */
const MATCH_MAX_LENGTH = 1024;

const SLASH = 47; // "/"
const DASH = 45; // "-"
const UNDERSCORE = 95; // "_"
const SPACE = 32; // " "
const DOT = 46; // "."

// Scoring is synchronous and runs for every candidate file, so the rows are allocated once and reused.
const bonus = new Float64Array(MATCH_MAX_LENGTH);
let previousRowD = new Float64Array(MATCH_MAX_LENGTH);
let previousRowM = new Float64Array(MATCH_MAX_LENGTH);
let currentRowD = new Float64Array(MATCH_MAX_LENGTH);
let currentRowM = new Float64Array(MATCH_MAX_LENGTH);

/** Whether every character of `needle` appears in `haystack`, in order. */
export function hasMatch(needle: string, haystack: string): boolean {
  let from = 0;
  for (let i = 0; i < needle.length; i++) {
    const found = haystack.indexOf(needle[i], from);
    if (found === -1) {
      return false;
    }
    from = found + 1;
  }
  return true;
}

/**
 * How well `needle` matches, from 0 (barely) to 1 (an exact match, or every character consecutive from the
 * start of a path segment). Call only after `hasMatch(needle, comparable)` succeeded.
 *
 * @param comparable The haystack as compared with `needle`: lowercased for a case-insensitive match.
 * @param original The haystack with its original casing, which decides where camelCase humps are.
 */
export function matchQuality(needle: string, comparable: string, original: string): number {
  const n = needle.length;
  const m = comparable.length;
  if (n === 0 || m > MATCH_MAX_LENGTH) {
    return 0;
  }
  const bestPossible = SCORE_MATCH_SLASH + (n - 1) * SCORE_MATCH_CONSECUTIVE;
  const raw = n === 1 ? singleCharScore(needle.charCodeAt(0), comparable, original) : score(needle, comparable, original);
  return Math.min(1, Math.max(0, raw / bestPossible));
}

/**
 * The highest `matchQuality()` a needle of length `n` could reach in a haystack of length `m`, in O(1):
 * no character earns more than a consecutive match and every unmatched character costs at least 5.
 * Lets ranking skip aligning files that could not reach the results anyway.
 */
export function matchQualityCeiling(n: number, m: number): number {
  if (n === 0 || m > MATCH_MAX_LENGTH) {
    return 0;
  }
  const bestPossible = SCORE_MATCH_SLASH + (n - 1) * SCORE_MATCH_CONSECUTIVE;
  const cheapestGap = Math.max(SCORE_GAP_LEADING, SCORE_GAP_TRAILING, SCORE_GAP_INNER);
  return Math.max(0, (bestPossible + (m - n) * cheapestGap) / bestPossible);
}

/**
 * `score()` for a one-character needle, without the matrix: the characters before a match are leading gaps
 * and those after it trailing gaps, so each match position's score is known directly. The first keystroke
 * matches almost every file, which makes this the most frequent case.
 */
function singleCharScore(needleChar: number, comparable: string, original: string): number {
  const m = comparable.length;
  let best = -Infinity;
  let lastChar = SLASH;
  for (let j = 0; j < m; j++) {
    const thisChar = original.charCodeAt(j);
    if (comparable.charCodeAt(j) === needleChar) {
      const matchScore = bonusFor(lastChar, thisChar) + j * SCORE_GAP_LEADING + (m - 1 - j) * SCORE_GAP_TRAILING;
      best = Math.max(best, matchScore);
    }
    lastChar = thisChar;
  }
  return best;
}

function score(needle: string, comparable: string, original: string): number {
  const n = needle.length;
  const m = comparable.length;
  precomputeBonus(original);

  for (let i = 0; i < n; i++) {
    const needleChar = needle.charCodeAt(i);
    const gapScore = i === n - 1 ? SCORE_GAP_TRAILING : SCORE_GAP_INNER;
    let bestEndingHere = -Infinity;

    for (let j = 0; j < m; j++) {
      if (comparable.charCodeAt(j) === needleChar) {
        let matchScore = -Infinity;
        if (i === 0) {
          matchScore = j * SCORE_GAP_LEADING + bonus[j];
        } else if (j > 0) {
          matchScore = Math.max(
            previousRowM[j - 1] + bonus[j],
            previousRowD[j - 1] + SCORE_MATCH_CONSECUTIVE
          );
        }
        currentRowD[j] = matchScore;
        bestEndingHere = Math.max(matchScore, bestEndingHere + gapScore);
      } else {
        currentRowD[j] = -Infinity;
        bestEndingHere = bestEndingHere + gapScore;
      }
      currentRowM[j] = bestEndingHere;
    }

    [previousRowD, currentRowD] = [currentRowD, previousRowD];
    [previousRowM, currentRowM] = [currentRowM, previousRowM];
  }
  return previousRowM[m - 1];
}

function precomputeBonus(haystack: string): void {
  let lastChar = SLASH;
  for (let j = 0; j < haystack.length; j++) {
    const thisChar = haystack.charCodeAt(j);
    bonus[j] = bonusFor(lastChar, thisChar);
    lastChar = thisChar;
  }
}

/** The bonus for matching `thisChar` when it follows `lastChar` (a "/" before the first character). */
function bonusFor(lastChar: number, thisChar: number): number {
  if (lastChar === SLASH) {
    return SCORE_MATCH_SLASH;
  } else if (lastChar === DASH || lastChar === UNDERSCORE || lastChar === SPACE) {
    return SCORE_MATCH_WORD;
  } else if (lastChar === DOT) {
    return SCORE_MATCH_DOT;
  } else if (isLowerAscii(lastChar) && isUpperAscii(thisChar)) {
    return SCORE_MATCH_CAPITAL;
  }
  return 0;
}

function isLowerAscii(code: number): boolean {
  return code >= 97 && code <= 122;
}

function isUpperAscii(code: number): boolean {
  return code >= 65 && code <= 90;
}
