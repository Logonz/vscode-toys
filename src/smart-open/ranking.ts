import { passesTerms, scoreTerms, type MatchableFile, type Term, type TextMatch } from "./query";

/** How well the query matched; see {@link TextMatch}. */
export const TEXT_SIGNALS = ["pathMatch", "nameMatch"] as const;

/** What the picker knows about a file before you type, each from 0 to 1. */
export const CONTEXT_SIGNALS = [
  "openTab",
  "previousFile",
  "proximity",
  "sameWorkspaceFolder",
  "frecency",
  "recency",
  "relationship",
  "changed",
  "coChange",
] as const;

export type TextSignal = (typeof TEXT_SIGNALS)[number];
export type ContextSignal = (typeof CONTEXT_SIGNALS)[number];
export type Signal = TextSignal | ContextSignal;
export const SIGNALS: readonly Signal[] = [...TEXT_SIGNALS, ...CONTEXT_SIGNALS];

export type Weights = Readonly<Record<Signal, number>>;
export type SignalValues = Readonly<Record<Signal, number>>;
type ContextValues = Readonly<Record<ContextSignal, number>>;

/**
 * Text weighs up to 270 and all context together about 80 (smart-open.nvim's weights). Text counts in full
 * from six typed characters (see `queryConfidence`): before that, history and context decide most; after,
 * context reorders matches of similar quality but cannot lift a scattered match above a file-name match.
 */
export const DEFAULT_WEIGHTS: Weights = {
  pathMatch: 140,
  nameMatch: 130,
  openTab: 3,
  previousFile: 4,
  proximity: 13,
  sameWorkspaceFolder: 10,
  frecency: 17,
  recency: 9,
  relationship: 10,
  changed: 6,
  coChange: 6,
};

export interface RankableFile extends MatchableFile {
  /** See `fileKey()`. */
  readonly key: string;
  /** `relativePath` without the file name; "" at the root. */
  readonly directory: string;
  /** Position of the file's workspace folder in `workspace.workspaceFolders`. */
  readonly folderIndex: number;
}

/** Everything the context signals need, gathered once when the picker opens. */
export interface RankingContext {
  /** The file in the active editor. */
  readonly current: { readonly key: string; readonly directory: string; readonly folderIndex: number } | undefined;
  readonly previousKey: string | undefined;
  readonly openTabKeys: ReadonlySet<string>;
  readonly changedKeys: ReadonlySet<string>;
  /** Each 0–1, keyed by file key; files without a value are absent. */
  readonly frecency: ReadonlyMap<string, number>;
  readonly recency: ReadonlyMap<string, number>;
  readonly relationship: ReadonlyMap<string, number>;
  readonly coChange: ReadonlyMap<string, number>;
}

const NO_CONTEXT: ContextValues = Object.fromEntries(CONTEXT_SIGNALS.map((signal) => [signal, 0])) as ContextValues;

export function contextSignals(file: RankableFile, context: RankingContext): ContextValues {
  const values = { ...NO_CONTEXT };
  writeContextSignals(file, context, values);
  return values;
}

export function signalValues(file: RankableFile, text: TextMatch, context: RankingContext): SignalValues {
  return { pathMatch: text.path, nameMatch: text.name, ...contextSignals(file, context) };
}

// Reused by baseScore(), which runs for every file each time the picker opens.
const baseScoreSignals: Record<ContextSignal, number> = { ...NO_CONTEXT };

/** The part of a file's score that does not depend on the query. */
export function baseScore(file: RankableFile, context: RankingContext, weights: Weights): number {
  writeContextSignals(file, context, baseScoreSignals);
  let total = 0;
  for (const signal of CONTEXT_SIGNALS) {
    total += weights[signal] * baseScoreSignals[signal];
  }
  return total;
}

/** The one definition of every context signal. The current file gets none: you are already there. */
function writeContextSignals(file: RankableFile, context: RankingContext, values: Record<ContextSignal, number>): void {
  const current = context.current;
  if (file.key === current?.key) {
    Object.assign(values, NO_CONTEXT);
    return;
  }
  values.openTab = context.openTabKeys.has(file.key) ? 1 : 0;
  values.previousFile = file.key === context.previousKey ? 1 : 0;
  values.proximity = current ? proximity(file.directory, current.directory) : 0;
  values.sameWorkspaceFolder = file.folderIndex === current?.folderIndex ? 1 : 0;
  values.frecency = context.frecency.get(file.key) ?? 0;
  values.recency = context.recency.get(file.key) ?? 0;
  values.relationship = context.relationship.get(file.key) ?? 0;
  values.changed = context.changedKeys.has(file.key) ? 1 : 0;
  values.coChange = context.coChange.get(file.key) ?? 0;
}

/**
 * The share of the current file's folders that `directory` is also inside: 1 for the same folder or a
 * subfolder of it, 0 for nothing in common or when the current file sits at the root.
 */
export function proximity(directory: string, currentDirectory: string): number {
  if (currentDirectory === "") {
    return 0;
  }
  const folders = foldersOf(currentDirectory);
  let shared = 0;
  while (shared < folders.length && isInside(directory, folders[shared])) {
    shared++;
  }
  return shared / folders.length;
}

let lastDirectory = "";
let lastFolders: string[] = [];

/** "a/b/c" → ["a", "a/b", "a/b/c"]. Remembers the last answer, since one ranking asks about the same directory for every file. */
function foldersOf(directory: string): readonly string[] {
  if (directory !== lastDirectory) {
    lastFolders = [];
    for (let end = directory.indexOf("/"); end !== -1; end = directory.indexOf("/", end + 1)) {
      lastFolders.push(directory.slice(0, end));
    }
    lastFolders.push(directory);
    lastDirectory = directory;
  }
  return lastFolders;
}

function isInside(directory: string, folder: string): boolean {
  return directory === folder || (directory.startsWith(folder) && directory.charCodeAt(folder.length) === 47 /* "/" */);
}

export interface RankedFile {
  /** Position in the ranked file list. */
  readonly fileIndex: number;
  readonly score: number;
  readonly text: TextMatch;
}

export interface Ranking {
  /** The best `limit` matches, best first. */
  readonly results: readonly RankedFile[];
  /** Positions of every matching file, ascending: the candidates for a query that narrows this one. */
  readonly matches: Int32Array;
}

/**
 * Scores every file that matches `terms` and keeps the best `limit`, ordered by score, then shorter path,
 * then path, so equal scores never reshuffle between keystrokes.
 *
 * @param baseScores `baseScore()` of each file, by position.
 * @param candidates Positions of the files to consider (see `narrowsSearch()`); all files when omitted.
 */
export function rank(
  files: readonly RankableFile[],
  baseScores: Float64Array,
  terms: readonly Term[],
  weights: Weights,
  limit: number,
  candidates?: Int32Array
): Ranking {
  const best: RankedFile[] = [];
  const candidateCount = candidates?.length ?? files.length;
  const matches = new Int32Array(candidateCount);
  let matchCount = 0;
  // Reused for every file: most never make the top `limit`.
  const ceiling = { path: 0, name: 0 };
  const text = { path: 0, name: 0 };

  for (let i = 0; i < candidateCount; i++) {
    const fileIndex = candidates ? candidates[i] : i;
    const file = files[fileIndex];
    if (!passesTerms(terms, file, ceiling)) {
      continue;
    }
    matches[matchCount++] = fileIndex;
    const base = baseScores[fileIndex];
    const isFull = best.length === limit;

    // Weights are at least 1, so a file whose best possible score ranks after the last result cannot get in;
    // this skips aligning the query against most files.
    const bestPossible = base + weights.pathMatch * ceiling.path + weights.nameMatch * ceiling.name;
    if (isFull && compareRanked(files, bestPossible, fileIndex, best[limit - 1]) >= 0) {
      continue;
    }
    scoreTerms(terms, file, text);
    const score = base + weights.pathMatch * text.path + weights.nameMatch * text.name;
    if (isFull && compareRanked(files, score, fileIndex, best[limit - 1]) >= 0) {
      continue;
    }

    // Binary search for the insertion point keeps this O(n log limit) instead of sorting every match.
    let low = 0;
    let high = best.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (compareRanked(files, score, fileIndex, best[middle]) > 0) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    best.splice(low, 0, { fileIndex, score, text: { path: text.path, name: text.name } });
    if (best.length > limit) {
      best.pop();
    }
  }
  return { results: best, matches: matches.slice(0, matchCount) };
}

/** Negative when the candidate (`score`, `fileIndex`) ranks before `other`. */
function compareRanked(files: readonly RankableFile[], score: number, fileIndex: number, other: RankedFile): number {
  if (score !== other.score) {
    return other.score - score;
  }
  const path = files[fileIndex].relativePath;
  const otherPath = files[other.fileIndex].relativePath;
  if (path.length !== otherPath.length) {
    return path.length - otherPath.length;
  }
  return path < otherPath ? -1 : path > otherPath ? 1 : 0;
}
