import type { Memento } from "vscode";
import { fileKey } from "./fileKey";

const STORAGE_KEY = "vstoys.smart-open.history";
/** Smart Open's earlier recency scorer stored `{ [fsPath]: lastOpenedMs }` here; used once to seed the log. */
const LEGACY_RECENCY_KEY = "vstoys.recency.files";

/** Weeks of use: switching back and forth between two files is not logged per switch (see `record`). */
const MAX_VISITS = 5000;
const HALF_LIFE_MS = 10 * 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 5000;
const MINUTE_MS = 60 * 1000;
/** Visits to a file closer together than this are one stretch of work, not separate visits. */
const REVISIT_MS = 5 * MINUTE_MS;

interface Visit {
  readonly key: string;
  readonly at: number;
}

/** Each file key stored once; visits as `[index into keys, minutes since epoch]`. */
interface StoredHistory {
  readonly keys: string[];
  readonly visits: [number, number][];
}

/** What history says about each file, relative to the current one. Each value is 0–1; files with no value are absent. */
export interface HistoryScores {
  /** Visits weighted by age (half after 10 days, a quarter after 20), counting a file at most once per 5 minutes. */
  readonly frecency: ReadonlyMap<string, number>;
  /** `8 / (rank + 7)` by last visit: the most recent file other than the current one gets 1, the tenth 0.47. */
  readonly recency: ReadonlyMap<string, number>;
  /** Age-weighted count of visits right before or after a visit to the current file. */
  readonly relationship: ReadonlyMap<string, number>;
  /** The most recently visited file other than the current one. */
  readonly previousKey: string | undefined;
}

/**
 * The files visited in this workspace, oldest first. One log is the single source for frecency, recency,
 * relationships and the previous file, so changing a formula never needs a data migration.
 */
export class AccessHistory {
  private visits: Visit[];
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** Whether there are visits the storage does not have yet. */
  private unsaved = false;

  constructor(
    private readonly storage: Memento,
    private readonly log: (message: string) => void
  ) {
    this.visits = this.load();
  }

  get visitCount(): number {
    return this.visits.length;
  }

  /**
   * Records a visit, unless `key` is already the latest one, or the one before it within the last 5 minutes:
   * flipping between a file and its test 200 times would otherwise flood the log and the frecency.
   */
  record(key: string, at = Date.now()): void {
    const latest = this.visits[this.visits.length - 1];
    const beforeLatest = this.visits[this.visits.length - 2];
    if (latest?.key === key || (beforeLatest?.key === key && at - beforeLatest.at < REVISIT_MS)) {
      return;
    }
    this.visits.push({ key, at });
    if (this.visits.length > MAX_VISITS) {
      this.visits.splice(0, this.visits.length - MAX_VISITS);
    }
    this.unsaved = true;
    this.saveTimer ??= setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  scores(currentKey: string | undefined, now = Date.now()): HistoryScores {
    const frecency = new Map<string, number>();
    const recency = new Map<string, number>();
    const relationship = new Map<string, number>();
    let previousKey: string | undefined;
    const lastCountedAt = new Map<string, number>();

    for (let i = this.visits.length - 1; i >= 0; i--) {
      const { key, at } = this.visits[i];
      const weight = Math.pow(0.5, Math.max(0, now - at) / HALF_LIFE_MS);
      const countedAt = lastCountedAt.get(key);
      if (countedAt === undefined || countedAt - at >= REVISIT_MS) {
        frecency.set(key, (frecency.get(key) ?? 0) + weight);
        lastCountedAt.set(key, at);
      }

      if (key !== currentKey && !recency.has(key)) {
        recency.set(key, 8 / (recency.size + 1 + 7));
        previousKey ??= key;
      }

      const before = i > 0 ? this.visits[i - 1].key : undefined;
      const partner = key === currentKey ? before : before === currentKey ? key : undefined;
      if (currentKey !== undefined && partner !== undefined) {
        relationship.set(partner, (relationship.get(partner) ?? 0) + weight);
      }
    }
    return { frecency: scaledToMax(frecency), recency, relationship: scaledToMax(relationship), previousKey };
  }

  /** Saves unsaved visits now instead of after the pending delay. */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    if (!this.unsaved) {
      return;
    }
    this.unsaved = false;
    const keys: string[] = [];
    const keyIndexes = new Map<string, number>();
    const visits = this.visits.map(({ key, at }): [number, number] => {
      let index = keyIndexes.get(key);
      if (index === undefined) {
        index = keys.push(key) - 1;
        keyIndexes.set(key, index);
      }
      return [index, Math.floor(at / MINUTE_MS)];
    });
    const stored: StoredHistory = { keys, visits };
    this.storage.update(STORAGE_KEY, stored).then(undefined, (error) => {
      this.log(`Could not save the visit history: ${error}`);
    });
  }

  dispose(): void {
    this.flush();
  }

  private load(): Visit[] {
    const stored = this.storage.get<unknown>(STORAGE_KEY);
    if (stored === undefined) {
      return this.seedFromLegacyRecency();
    }
    if (!isStoredHistory(stored)) {
      this.log("The stored visit history is unreadable; starting a new one.");
      return [];
    }
    const visits: Visit[] = [];
    for (const [keyIndex, minute] of stored.visits) {
      const key = stored.keys[keyIndex];
      if (typeof key === "string" && Number.isFinite(minute)) {
        visits.push({ key, at: minute * MINUTE_MS });
      }
    }
    return visits.slice(-MAX_VISITS);
  }

  /** One visit per file at its last-opened time, so ranking does not start from nothing after the upgrade. */
  private seedFromLegacyRecency(): Visit[] {
    const legacy = this.storage.get<unknown>(LEGACY_RECENCY_KEY);
    if (typeof legacy !== "object" || legacy === null) {
      return [];
    }
    const visits = Object.entries(legacy)
      .filter((entry): entry is [string, number] => Number.isFinite(entry[1]))
      .map(([fsPath, at]) => ({ key: fileKey(fsPath), at }))
      .sort((a, b) => a.at - b.at)
      .slice(-MAX_VISITS);
    if (visits.length > 0) {
      this.log(`Seeded the visit history with ${visits.length} files from the previous recency data.`);
    }
    return visits;
  }
}

function scaledToMax(values: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const value of values.values()) {
    max = Math.max(max, value);
  }
  if (max > 0) {
    for (const [key, value] of values) {
      values.set(key, value / max);
    }
  }
  return values;
}

function isStoredHistory(value: unknown): value is StoredHistory {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { keys, visits } = value as Record<string, unknown>;
  return (
    Array.isArray(keys) &&
    Array.isArray(visits) &&
    visits.every((visit) => Array.isArray(visit) && visit.length === 2 && Number.isInteger(visit[0]))
  );
}
