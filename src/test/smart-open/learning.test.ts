import * as assert from "assert";
import { LearnedRanking, reviseWeights, type ShownResult } from "../../smart-open/learning";
import { DEFAULT_WEIGHTS, SIGNALS, type Signal, type SignalValues } from "../../smart-open/ranking";
import { MemoryMemento } from "./memoryMemento";

const NO_SIGNALS = Object.fromEntries(SIGNALS.map((signal) => [signal, 0])) as SignalValues;

function shown(signals: Partial<Record<Signal, number>>, isCurrentFile = false): ShownResult {
  return { signals: { ...NO_SIGNALS, ...signals }, isCurrentFile };
}

function assertClose(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: expected ${expected}, got ${actual}`);
}

// The rule: each miss moves 0.6 points (times its share) from the signals where it beat the pick to those
// where the pick beat it, split in proportion to the differences.

suite("smart-open learning", () => {
  test("picking a lower result shifts weight toward what it had more of", () => {
    // Against each of the two misses, the pick is ahead on frecency and behind on text, split evenly between
    // path and name. Each miss counts half: frecency gains 2 × 0.3, the text weights lose 2 × 0.15 each.
    const results = [
      shown({ pathMatch: 1, nameMatch: 1 }),
      shown({ pathMatch: 0.9, nameMatch: 0.9 }),
      shown({ pathMatch: 0.8, nameMatch: 0.8, frecency: 1 }),
    ];
    const revised = reviseWeights(DEFAULT_WEIGHTS, results, 2);
    assertClose(revised.frecency, DEFAULT_WEIGHTS.frecency + 0.6, "frecency");
    assertClose(revised.pathMatch, DEFAULT_WEIGHTS.pathMatch - 0.3, "pathMatch");
    assertClose(revised.nameMatch, DEFAULT_WEIGHTS.nameMatch - 0.3, "nameMatch");
    assert.strictEqual(revised.openTab, DEFAULT_WEIGHTS.openTab, "signals equal everywhere stay put");
  });

  test("each result above the pick counts equally", () => {
    // Miss 1 beat the pick on path only; miss 2 on path and open tab equally.
    const results = [shown({ pathMatch: 1 }), shown({ pathMatch: 1, openTab: 1 }), shown({ frecency: 1 })];
    const revised = reviseWeights(DEFAULT_WEIGHTS, results, 2);
    assertClose(revised.frecency, DEFAULT_WEIGHTS.frecency + 0.6, "frecency");
    assertClose(revised.pathMatch, DEFAULT_WEIGHTS.pathMatch - 0.3 - 0.15, "pathMatch");
    assertClose(revised.openTab, DEFAULT_WEIGHTS.openTab - 0.15, "openTab");
  });

  test("a pick beaten on every signal it differs on moves nothing, so weight is never drained", () => {
    // e.g. picking Button.test.tsx right under Button.tsx: the only differences favor the result above.
    const results = [shown({ pathMatch: 1, nameMatch: 1 }), shown({ pathMatch: 0.996, nameMatch: 0.99 })];
    assert.deepStrictEqual(reviseWeights(DEFAULT_WEIGHTS, results, 1), DEFAULT_WEIGHTS);
  });

  test("the result below teaches only when the top result was picked, at a tenth of the strength", () => {
    const top = reviseWeights(DEFAULT_WEIGHTS, [shown({ pathMatch: 0.9, frecency: 1 }), shown({ pathMatch: 1 })], 0);
    assertClose(top.frecency, DEFAULT_WEIGHTS.frecency + 0.06, "frecency after a top pick");
    assertClose(top.pathMatch, DEFAULT_WEIGHTS.pathMatch - 0.06, "pathMatch after a top pick");

    const second = reviseWeights(DEFAULT_WEIGHTS, [shown({ pathMatch: 1 }), shown({ frecency: 1 }), shown({ recency: 1 })], 1);
    assert.strictEqual(second.recency, DEFAULT_WEIGHTS.recency, "the result below a lower pick is ignored");
    assertClose(second.frecency, DEFAULT_WEIGHTS.frecency + 0.6, "frecency after a second-place pick");
  });

  test("weights stay between a quarter and four times their default, and at least 1", () => {
    const low = reviseWeights({ ...DEFAULT_WEIGHTS, openTab: 1.1 }, [shown({ openTab: 1 }), shown({ frecency: 1 })], 1);
    assert.strictEqual(low.openTab, 1, "a quarter of 3 is below the absolute minimum of 1");
    const high = reviseWeights({ ...DEFAULT_WEIGHTS, frecency: 68 }, [shown({ openTab: 1 }), shown({ frecency: 1 })], 1);
    assert.strictEqual(high.frecency, 4 * DEFAULT_WEIGHTS.frecency);
  });

  test("the current file teaches nothing, as a pick or as a miss", () => {
    const current = shown({ frecency: 1 }, true);
    assert.deepStrictEqual(reviseWeights(DEFAULT_WEIGHTS, [shown({ pathMatch: 1 }), current], 1), DEFAULT_WEIGHTS);
    assert.deepStrictEqual(reviseWeights(DEFAULT_WEIGHTS, [current, shown({ pathMatch: 1 })], 1), DEFAULT_WEIGHTS);
  });

  test("stored data is validated: weights are kept in range, unusable values fall back to defaults and are reported", () => {
    const storage = new MemoryMemento();
    void storage.update("vstoys.smart-open.learning", {
      weights: { pathMatch: 200, nameMatch: 9999, frecency: -5, recency: "high", retiredSignal: 3 },
      pickPositions: [0, 2, "x", -1],
    });
    const messages: string[] = [];
    const learning = new LearnedRanking(storage, (message) => messages.push(message));
    assert.strictEqual(learning.weights.pathMatch, 200);
    assert.strictEqual(learning.weights.nameMatch, 4 * DEFAULT_WEIGHTS.nameMatch);
    assert.strictEqual(learning.weights.frecency, DEFAULT_WEIGHTS.frecency / 4);
    assert.strictEqual(learning.weights.recency, DEFAULT_WEIGHTS.recency);
    assert.strictEqual(messages.length, 1, "only the value that is not a number is reported");
    assert.strictEqual(learning.averagePickPosition, 1);
  });

  test("picks from every window add up, since all windows share global state", () => {
    const storage = new MemoryMemento();
    const windowA = new LearnedRanking(storage, () => {});
    const windowB = new LearnedRanking(storage, () => {}); // Created before A learns anything.
    windowA.learnFromPick([shown({ pathMatch: 1 }), shown({ frecency: 1 })], 1);
    windowB.learnFromPick([shown({ pathMatch: 1 }), shown({ frecency: 1 })], 1);
    assert.strictEqual(windowA.pickCount, 2);
    assertClose(windowA.weights.frecency, DEFAULT_WEIGHTS.frecency + 1.2, "both picks moved frecency");
  });

  test("learning persists, and reset restores the defaults", () => {
    const storage = new MemoryMemento();
    const learning = new LearnedRanking(storage, () => {});
    learning.learnFromPick([shown({ pathMatch: 1 }), shown({ frecency: 1 })], 1);
    assert.ok(new LearnedRanking(storage, () => {}).weights.frecency > DEFAULT_WEIGHTS.frecency);
    assert.strictEqual(new LearnedRanking(storage, () => {}).averagePickPosition, 1);

    learning.reset();
    const reloaded = new LearnedRanking(storage, () => {});
    assert.deepStrictEqual(reloaded.weights, DEFAULT_WEIGHTS);
    assert.strictEqual(reloaded.pickCount, 0);
  });
});
