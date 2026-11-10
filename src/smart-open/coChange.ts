import * as path from "path";
import { fileKey } from "./fileKey";
import { runGit } from "./git";
import { parseNameStatusPaths } from "./gitOutput";

const CACHE_MS = 5 * 60 * 1000;
const MAX_CACHED_FILES = 20;
const COMMIT_BATCH_SIZE = 256;

interface CacheEntry {
  readonly createdAt: number;
  /** Undefined while git is still running. */
  scores: ReadonlyMap<string, number> | undefined;
}

/**
 * How often each file was committed together with a given file over the last year, 0–1 (log-scaled, the most
 * frequent partner is 1). Git takes a while on long histories, so results are computed in the background,
 * one file at a time, and the last 20 files' results are cached for 5 minutes.
 */
export class CoChangeCache {
  private readonly entries = new Map<string, CacheEntry>();
  private computing = false;

  constructor(private readonly log: (message: string) => void) {}

  /**
   * The scores for the file at `fsPath` when cached; otherwise starts computing them, unless another file's are
   * being computed, and returns undefined. `onReady` runs when a computation started by this call has finished.
   *
   * @param cwd The workspace folder containing the file; git runs there.
   */
  lookup(fsPath: string, cwd: string, onReady: () => void): ReadonlyMap<string, number> | undefined {
    const now = Date.now();
    for (const [cachedKey, entry] of this.entries) {
      if (entry.scores && now - entry.createdAt >= CACHE_MS) {
        this.entries.delete(cachedKey);
      }
    }
    const key = fileKey(fsPath);
    const cached = this.entries.get(key);
    if (cached || this.computing) {
      return cached?.scores; // Another file's history is being read; this one is tried on a later open.
    }

    const [oldest] = this.entries.keys(); // Maps iterate in insertion order.
    if (oldest !== undefined && this.entries.size >= MAX_CACHED_FILES) {
      this.entries.delete(oldest);
    }
    const entry: CacheEntry = { createdAt: now, scores: undefined };
    this.entries.set(key, entry);
    this.computing = true;
    coChangeScores(fsPath, cwd)
      .then(
        (scores) => {
          entry.scores = scores;
          onReady();
        },
        (error) => {
          this.entries.delete(key); // Try again next time instead of caching the failure.
          this.log(`Could not read co-change history for ${fsPath}: ${error instanceof Error ? error.message : error}`);
        }
      )
      .finally(() => {
        this.computing = false;
      });
    return undefined;
  }
}

async function coChangeScores(fsPath: string, cwd: string): Promise<ReadonlyMap<string, number>> {
  const relativePath = path.relative(cwd, fsPath).split(path.sep).join("/");
  // --literal-pathspecs: a route file like `pages/[id].tsx` is a name, not a pattern.
  const logCommand = ["--literal-pathspecs", "log", "--format=%H", "--no-merges", "--since=365.days", "-n", "5000", "--follow"];
  const commits = (await runGit([...logCommand, "--", relativePath], cwd)).split("\n").filter((line) => line.length > 0);

  const ownKey = fileKey(fsPath);
  const counts = new Map<string, number>();
  for (let start = 0; start < commits.length; start += COMMIT_BATCH_SIZE) {
    const batch = commits.slice(start, start + COMMIT_BATCH_SIZE);
    // --relative: paths relative to `cwd`, like `relativePath`, even when the folder is not the repository root.
    const output = await runGit(["show", "-z", "--name-status", "--format=", "-M", "--relative", ...batch], cwd);
    for (const changedPath of parseNameStatusPaths(output)) {
      const key = fileKey(path.join(cwd, changedPath));
      if (key !== ownKey) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  let maxCount = 0;
  for (const count of counts.values()) {
    maxCount = Math.max(maxCount, count);
  }
  const scores = new Map<string, number>();
  for (const [key, count] of counts) {
    scores.set(key, Math.log1p(count) / Math.log1p(maxCount));
  }
  return scores;
}
