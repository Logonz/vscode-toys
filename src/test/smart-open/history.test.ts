import * as assert from "assert";
import { fileKey } from "../../smart-open/fileKey";
import { AccessHistory } from "../../smart-open/history";
import { MemoryMemento } from "./memoryMemento";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const NOW = Date.UTC(2026, 10, 10, 12);

function historyOf(visits: [string, number][], storage = new MemoryMemento()): AccessHistory {
  const history = new AccessHistory(storage, () => {});
  for (const [key, at] of visits) {
    history.record(key, at);
  }
  history.flush(); // Also cancels the delayed save, so no timer outlives the test.
  return history;
}

/** Visits to `keys` in order, 10 minutes apart (further apart than the 5-minute revisit window), ending at `end`. */
function spaced(keys: string[], end = NOW): [string, number][] {
  return keys.map((key, i): [string, number] => [key, end - (keys.length - 1 - i) * 10 * MINUTE]);
}

function assertClose(actual: number | undefined, expected: number, label: string): void {
  assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-3, `${label}: expected ${expected}, got ${actual}`);
}

suite("smart-open history", () => {
  test("recency ranks files by last visit, skipping the current file", () => {
    const scores = historyOf(spaced(["a", "b", "c"])).scores("c", NOW);
    assert.strictEqual(scores.previousKey, "b");
    assert.strictEqual(scores.recency.get("b"), 1);
    assert.strictEqual(scores.recency.get("a"), 8 / 9);
    assert.strictEqual(scores.recency.has("c"), false);
  });

  test("frecency halves every 10 days", () => {
    const scores = historyOf([["old", NOW - 10 * DAY], ["new", NOW]]).scores(undefined, NOW);
    assert.strictEqual(scores.frecency.get("new"), 1);
    assert.strictEqual(scores.frecency.get("old"), 0.5);
  });

  test("frecency counts visits: three today beat one today, which beats three a month ago", () => {
    const scores = historyOf([
      ...spaced(["old", "x", "old", "x", "old"], NOW - 30 * DAY),
      ...spaced(["busy", "fresh", "busy", "y", "busy"]),
    ]).scores(undefined, NOW);
    assert.strictEqual(scores.frecency.get("busy"), 1, "the top file scales to 1");
    assertClose(scores.frecency.get("fresh"), 1 / 3, "fresh");
    assertClose(scores.frecency.get("old"), 3 / 8 / 3, "old: three visits, three half-lives ago");
  });

  test("visits to a file within 5 minutes count once for frecency", () => {
    // Same instant, so decay cannot make the counts differ.
    const scores = historyOf([["a", NOW], ["x", NOW], ["y", NOW], ["a", NOW]]).scores(undefined, NOW);
    assert.strictEqual(scores.frecency.get("a"), scores.frecency.get("x"));
  });

  test("switching back and forth between two files is one stretch of work, not a visit per switch", () => {
    const history = historyOf([["a", NOW - 4 * MINUTE], ["b", NOW - 3 * MINUTE], ["a", NOW - 2 * MINUTE], ["b", NOW - MINUTE], ["a", NOW]]);
    assert.strictEqual(history.visitCount, 2);
    assert.strictEqual(history.scores("a", NOW).previousKey, "b", "the previous file is still right");
    assert.strictEqual(history.scores("b", NOW).previousKey, "a");
    assert.strictEqual(historyOf(spaced(["a", "b", "a"])).visitCount, 3, "after 5 minutes it is a new visit");
  });

  test("relationship counts visits right before or after the current file", () => {
    const scores = historyOf(spaced(["a", "b", "a", "b", "c", "a", "d"])).scores("a", NOW);
    assertClose(scores.relationship.get("b"), 1, "b: three transitions");
    assertClose(scores.relationship.get("c"), 1 / 3, "c");
    assertClose(scores.relationship.get("d"), 1 / 3, "d");
    assert.strictEqual(scores.relationship.has("a"), false);
  });

  test("relationships fade like frecency", () => {
    const scores = historyOf([["a", NOW - 10 * DAY], ["c", NOW - 10 * DAY + MINUTE], ["b", NOW - MINUTE], ["c", NOW]]).scores("c", NOW);
    // b is next to c twice now (before and after the old c); a once, 10 days ago.
    assertClose(scores.relationship.get("a"), 0.25, "a");
  });

  test("returning to the latest file is not another visit", () => {
    const scores = historyOf([["a", NOW], ["a", NOW], ["b", NOW]]).scores(undefined, NOW);
    assert.strictEqual(scores.frecency.get("a"), scores.frecency.get("b"));
  });

  test("survives a reload", () => {
    const storage = new MemoryMemento();
    historyOf(spaced(["a", "b"]), storage);
    const scores = new AccessHistory(storage, () => {}).scores("b", NOW);
    assert.strictEqual(scores.previousKey, "a");
    assert.strictEqual(scores.recency.get("a"), 1);
  });

  test("keeps only the latest 5000 visits, in memory and in storage", () => {
    const storage = new MemoryMemento();
    const history = historyOf(Array.from({ length: 5001 }, (_, i): [string, number] => [`k${i}`, NOW - (5001 - i) * MINUTE]), storage);
    assert.strictEqual(history.visitCount, 5000);
    const reloaded = new AccessHistory(storage, () => {});
    assert.strictEqual(reloaded.visitCount, 5000);
    const scores = reloaded.scores(undefined, NOW);
    assert.strictEqual(scores.recency.has("k0"), false, "the oldest visit was dropped");
    assert.strictEqual(scores.previousKey, "k5000");
  });

  test("seeds from the previous recency data when there is no history yet", () => {
    const storage = new MemoryMemento();
    void storage.update("vstoys.recency.files", { "/repo/a.ts": NOW - 2 * DAY, "/repo/b.ts": NOW - DAY });
    const scores = new AccessHistory(storage, () => {}).scores(undefined, NOW);
    assert.strictEqual(scores.previousKey, fileKey("/repo/b.ts"));
    assert.strictEqual(scores.recency.get(fileKey("/repo/a.ts")), 8 / 9);
  });

  test("starts over, and says so, when the stored history is unreadable, but keeps it until there is something new", () => {
    const storage = new MemoryMemento();
    void storage.update("vstoys.smart-open.history", { keys: "not a list", visits: [] });
    const messages: string[] = [];
    const history = new AccessHistory(storage, (message) => messages.push(message));
    assert.strictEqual(history.visitCount, 0);
    assert.strictEqual(messages.length, 1);

    history.flush(); // As on every window blur.
    assert.deepStrictEqual(storage.get("vstoys.smart-open.history"), { keys: "not a list", visits: [] });
  });
});
