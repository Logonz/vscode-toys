import { hasMatch, matchQuality, matchQualityCeiling } from "./fzy";

/** The strings a query is matched against. The lowercase copies are computed once, when the file is indexed. */
export interface MatchableFile {
  /** Workspace-relative and `/`-separated; starts with the folder name in multi-root workspaces. */
  readonly relativePath: string;
  readonly relativePathLower: string;
  /** The custom label when one applies, otherwise {@link virtualName}. */
  readonly matchName: string;
  readonly matchNameLower: string;
}

type TermKind = "fuzzy" | "exact" | "prefix" | "suffix" | "equal";

/** One whitespace-separated part of the query. A file must satisfy every term. */
export interface Term {
  /** Already lowercased unless `caseSensitive`. */
  readonly text: string;
  readonly kind: TermKind;
  readonly negated: boolean;
  /** Smart case: a term containing an uppercase letter matches case-sensitively. */
  readonly caseSensitive: boolean;
}

/**
 * How well a file matched, each from 0 to 1: the average match quality of the query's fuzzy and exact
 * words, times {@link queryConfidence} (0 for a query without them: empty, or only `^`, `$` and `!` filters).
 */
export interface TextMatch {
  readonly path: number;
  readonly name: number;
}

/** Generic file names that say little alone, so the parent folder counts as part of the name (from smart-open.nvim). */
const GENERIC_FILE_NAMES = new Set([
  "index.js",
  "index.ts",
  "index.jsx",
  "index.tsx",
  "index.test.js",
  "index.test.ts",
  "index.test.jsx",
  "index.test.tsx",
  "__init__.py",
  "init.lua",
  "default.nix",
  "package.d",
]);

/** The file name, or `parent/name` for generic names like `index.ts`, so `button index` finds `button/index.ts`. */
export function virtualName(relativePath: string): string {
  const nameStart = relativePath.lastIndexOf("/") + 1;
  const fileName = relativePath.slice(nameStart);
  if (nameStart === 0 || !GENERIC_FILE_NAMES.has(fileName)) {
    return fileName;
  }
  return relativePath.slice(relativePath.lastIndexOf("/", nameStart - 2) + 1);
}

/**
 * Parses fzf's extended search syntax: whitespace separates terms, which are fuzzy unless prefixed with
 * `'` (exact substring), `^` (path starts with), or suffixed with `$` (path ends with); `^term$` means the
 * whole path, and `!` excludes files containing the term (or matching the `^`/`$` form that follows).
 */
export function parseQuery(input: string): Term[] {
  const terms: Term[] = [];
  for (const word of input.split(/\s+/)) {
    let text = word;
    let negated = false;
    if (text.startsWith("!")) {
      negated = true;
      text = text.slice(1);
    }

    let kind: TermKind = negated ? "exact" : "fuzzy";
    if (text.startsWith("'")) {
      kind = "exact";
      text = text.slice(1);
    } else if (text.startsWith("^")) {
      text = text.slice(1);
      kind = "prefix";
      if (text.length > 1 && text.endsWith("$")) {
        kind = "equal";
        text = text.slice(0, -1);
      }
    } else if (text.length > 1 && text.endsWith("$")) {
      kind = "suffix";
      text = text.slice(0, -1);
    }

    if (text.length > 0) {
      const caseSensitive = text !== text.toLowerCase();
      terms.push({ text, kind, negated, caseSensitive });
    }
  }
  return terms;
}

/**
 * Whether every file matching `next` also matched `previous`, so a search for `next` only needs to look at
 * `previous`'s matches. True when `next` only adds characters, unless it has an exclusion (a longer `!term`
 * excludes fewer files) or a `$` (adding to `ts$` turns a suffix into a different fuzzy term).
 */
export function narrowsSearch(previous: string, next: string): boolean {
  return next.startsWith(previous) && !next.includes("!") && !next.includes("$");
}

/** Undefined when the file fails any term; otherwise how well its path and name matched the scored terms. */
export function matchFile(terms: readonly Term[], file: MatchableFile): TextMatch | undefined {
  const scores = { path: 0, name: 0 };
  if (!passesTerms(terms, file, scores)) {
    return undefined;
  }
  scoreTerms(terms, file, scores);
  return scores;
}

/**
 * Whether the file satisfies every term. If it does, `ceiling` receives the highest scores `scoreTerms()`
 * could give it, from lengths alone, so ranking can skip aligning files that could not make the results.
 * Writing into `ceiling` keeps the scan over every file free of allocations.
 */
export function passesTerms(terms: readonly Term[], file: MatchableFile, ceiling: { path: number; name: number }): boolean {
  let pathTotal = 0;
  let nameTotal = 0;
  let scoredTerms = 0;

  for (const term of terms) {
    const path = term.caseSensitive ? file.relativePath : file.relativePathLower;
    if (isFilter(term)) {
      // Judged on the path, like fzf judges its whole line.
      if (pathSatisfies(term, path) === term.negated) {
        return false;
      }
      continue;
    }

    // A custom label need not appear in the path, so a term may match either.
    const name = term.caseSensitive ? file.matchName : file.matchNameLower;
    const inPath = contains(term, path);
    const inName = contains(term, name);
    if (!inPath && !inName) {
      return false;
    }
    pathTotal += inPath ? qualityCeiling(term, path, file.relativePath) : 0;
    nameTotal += inName ? qualityCeiling(term, name, file.matchName) : 0;
    scoredTerms++;
  }

  ceiling.path = scoredTerms === 0 ? 0 : (pathTotal / scoredTerms) * queryConfidence(terms);
  ceiling.name = scoredTerms === 0 ? 0 : (nameTotal / scoredTerms) * queryConfidence(terms);
  return true;
}

/** The scores of a file that `passesTerms()` accepted, written into `scores`. */
export function scoreTerms(terms: readonly Term[], file: MatchableFile, scores: { path: number; name: number }): void {
  let pathTotal = 0;
  let nameTotal = 0;
  let scoredTerms = 0;

  for (const term of terms) {
    if (isFilter(term)) {
      continue;
    }
    const path = term.caseSensitive ? file.relativePath : file.relativePathLower;
    const name = term.caseSensitive ? file.matchName : file.matchNameLower;
    pathTotal += contains(term, path) ? matchQuality(term.text, path, file.relativePath) : 0;
    nameTotal += contains(term, name) ? matchQuality(term.text, name, file.matchName) : 0;
    scoredTerms++;
  }

  scores.path = scoredTerms === 0 ? 0 : (pathTotal / scoredTerms) * queryConfidence(terms);
  scores.name = scoredTerms === 0 ? 0 : (nameTotal / scoredTerms) * queryConfidence(terms);
}

/**
 * The length-based ceiling is loose for one-character words (0.56 where the real quality is often 0.2),
 * which defeated skipping on queries like `somecomp t`. Their exact quality costs no more than `hasMatch`.
 */
function qualityCeiling(term: Term, comparable: string, original: string): number {
  return term.text.length === 1
    ? matchQuality(term.text, comparable, original)
    : matchQualityCeiling(term.text.length, comparable.length);
}

/** Characters a query needs before its match counts in full. */
const CONFIDENT_QUERY_LENGTH = 6;

/**
 * How much a query's match says, from 0 to 1: the characters in its fuzzy and exact words over 6, at most 1.
 * One or two letters match almost every file well, so history and context should decide those; the query
 * takes over as it grows, as in smart-open.nvim.
 */
export function queryConfidence(terms: readonly Term[]): number {
  let length = 0;
  for (const term of terms) {
    length += isFilter(term) ? 0 : term.text.length;
  }
  return Math.min(1, length / CONFIDENT_QUERY_LENGTH);
}

/** Terms that only include or exclude files: `^prefix`, `suffix$`, `^equal$` and every `!term`. */
function isFilter(term: Term): boolean {
  return term.negated || (term.kind !== "fuzzy" && term.kind !== "exact");
}

function contains(term: Term, haystack: string): boolean {
  return term.kind === "fuzzy" ? hasMatch(term.text, haystack) : haystack.includes(term.text);
}

function pathSatisfies(term: Term, path: string): boolean {
  switch (term.kind) {
    case "prefix":
      return path.startsWith(term.text);
    case "suffix":
      return path.endsWith(term.text);
    case "equal":
      return path === term.text;
    default:
      return path.includes(term.text);
  }
}
