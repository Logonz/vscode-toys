import * as assert from "assert";
import { matchFile, parseQuery, virtualName } from "../../smart-open/query";
import {
  baseScore,
  DEFAULT_WEIGHTS,
  proximity,
  rank,
  type RankableFile,
  type RankingContext,
} from "../../smart-open/ranking";

function rankable(relativePath: string): RankableFile {
  const matchName = virtualName(relativePath);
  const folderEnd = relativePath.lastIndexOf("/");
  return {
    key: `/repo/${relativePath}`,
    relativePath,
    relativePathLower: relativePath.toLowerCase(),
    matchName,
    matchNameLower: matchName.toLowerCase(),
    directory: folderEnd === -1 ? "" : relativePath.slice(0, folderEnd),
    folderIndex: 0,
  };
}

function context(overrides: Partial<RankingContext> = {}): RankingContext {
  return {
    current: undefined,
    previousKey: undefined,
    openTabKeys: new Set(),
    changedKeys: new Set(),
    frecency: new Map(),
    recency: new Map(),
    relationship: new Map(),
    coChange: new Map(),
    ...overrides,
  };
}

function rankPaths(files: RankableFile[], query: string, rankingContext = context()): string[] {
  const baseScores = Float64Array.from(files, (file) => baseScore(file, rankingContext, DEFAULT_WEIGHTS));
  const { results } = rank(files, baseScores, parseQuery(query), DEFAULT_WEIGHTS, 50);
  return results.map((result) => files[result.fileIndex].relativePath);
}

suite("smart-open ranking", () => {
  test("a file-name match beats a path-only match that has every context signal", () => {
    const nameMatch = rankable("src/main.ts");
    const pathOnly = rankable("lib/my-data/items/new.ts"); // m-y, d-a-ta, i-tems, n-ew
    const key = pathOnly.key;
    const everything = context({
      current: { key: "/repo/lib/my-data/items/current.ts", directory: "lib/my-data/items", folderIndex: 0 },
      previousKey: key,
      openTabKeys: new Set([key]),
      changedKeys: new Set([key]),
      frecency: new Map([[key, 1]]),
      recency: new Map([[key, 1]]),
      relationship: new Map([[key, 1]]),
      coChange: new Map([[key, 1]]),
    });
    assert.deepStrictEqual(rankPaths([pathOnly, nameMatch], "main", everything), [
      "src/main.ts",
      "lib/my-data/items/new.ts",
    ]);
  });

  test("with a letter or two, history decides; the query takes over as it grows", () => {
    const short = rankable("setup.py");
    const recent = rankable("src/main/java/com/acme/billing/service/impl/InvoiceServiceImpl.java");
    const k = recent.key;
    const history = context({
      previousKey: k,
      openTabKeys: new Set([k]),
      frecency: new Map([[k, 1]]),
      recency: new Map([[k, 1]]),
    });
    assert.deepStrictEqual(rankPaths([short, recent], "s", history), [recent.relativePath, short.relativePath]);
    assert.deepStrictEqual(rankPaths([short, recent], "setup", history), [short.relativePath]);
  });

  test("equal scores put the shorter path first, then the path in order", () => {
    // An empty query and no context: every score is 0.
    assert.deepStrictEqual(rankPaths([rankable("src/aaa.ts"), rankable("src/zz.ts"), rankable("src/ab.ts")], ""), [
      "src/ab.ts",
      "src/zz.ts",
      "src/aaa.ts",
    ]);
  });

  test("a file can reach the results on its name, even when its path alone scores below the current best", () => {
    // With room for one result, "main/x.ts" (a better path match, no name match) is ranked first; the second
    // file's path scores lower, so skipping it for its path ceiling alone would lose the better result.
    const files = [rankable("main/x.ts"), rankable("lib/deep/folder/main.ts")];
    const { results } = rank(files, new Float64Array(2), parseQuery("main"), DEFAULT_WEIGHTS, 1);
    assert.deepStrictEqual(
      results.map((result) => files[result.fileIndex].relativePath),
      ["lib/deep/folder/main.ts"]
    );
  });

  test("context decides between equally good matches", () => {
    const a = rankable("a/foo.ts");
    const b = rankable("b/foo.ts");
    assert.deepStrictEqual(rankPaths([b, a], "foo"), ["a/foo.ts", "b/foo.ts"], "ties fall back to the path");
    assert.deepStrictEqual(rankPaths([a, b], "foo", context({ frecency: new Map([[b.key, 0.5]]) })), [
      "b/foo.ts",
      "a/foo.ts",
    ]);
  });

  test("the current file gets no context score", () => {
    const current = rankable("a/foo.ts");
    const other = rankable("b/foo.ts");
    const rankingContext = context({
      current: { key: current.key, directory: "a", folderIndex: 0 },
      frecency: new Map([[current.key, 1]]),
      openTabKeys: new Set([current.key]),
    });
    assert.deepStrictEqual(rankPaths([current, other], "foo", rankingContext), ["b/foo.ts", "a/foo.ts"]);
  });

  test("keeps the best results in the documented order: score, then shorter path, then path", () => {
    // 500 distinct paths ((i * 7919) % 500 visits every number once) with varied history scores.
    const files = Array.from({ length: 500 }, (_, i) => rankable(`dir${i % 7}/file${(i * 7919) % 500}.ts`));
    const frecency = new Map(files.filter((_, i) => i % 3 === 0).map((file, i) => [file.key, ((i * 37) % 100) / 100]));
    const rankingContext = context({ frecency });
    const baseScores = Float64Array.from(files, (file) => baseScore(file, rankingContext, DEFAULT_WEIGHTS));
    const terms = parseQuery("fi 1");

    const expected = files
      .flatMap((file, fileIndex) => {
        const text = matchFile(terms, file);
        return text ? [{ path: file.relativePath, score: baseScores[fileIndex] + 140 * text.path + 130 * text.name }] : [];
      })
      .sort((a, b) => b.score - a.score || a.path.length - b.path.length || (a.path < b.path ? -1 : 1));

    const ranking = rank(files, baseScores, terms, DEFAULT_WEIGHTS, 20);
    assert.strictEqual(ranking.matches.length, expected.length);
    assert.deepStrictEqual(
      ranking.results.map((result) => files[result.fileIndex].relativePath),
      expected.slice(0, 20).map((entry) => entry.path)
    );
  });

  test("typing on and searching only the previous matches gives the same results as searching everything", () => {
    const files = Array.from({ length: 300 }, (_, i) => rankable(`src/mod${i % 11}/item${(i * 7) % 300}-index.ts`));
    const rankingContext = context({ frecency: new Map(files.filter((_, i) => i % 5 === 0).map((file) => [file.key, 0.4])) });
    const baseScores = Float64Array.from(files, (file) => baseScore(file, rankingContext, DEFAULT_WEIGHTS));
    let previous = rank(files, baseScores, parseQuery("i"), DEFAULT_WEIGHTS, 25);
    for (const input of ["in", "ind", "ind mod1", "ind mod1 ^src"]) {
      const narrowed = rank(files, baseScores, parseQuery(input), DEFAULT_WEIGHTS, 25, previous.matches);
      const full = rank(files, baseScores, parseQuery(input), DEFAULT_WEIGHTS, 25);
      assert.deepStrictEqual(narrowed, full, input);
      previous = narrowed;
    }
  });

  test("proximity is the share of the current file's folders a file sits in", () => {
    assert.strictEqual(proximity("src/smart-open/picks", "src/smart-open/picks"), 1);
    assert.strictEqual(proximity("src/smart-open/picks/sub", "src/smart-open/picks"), 1);
    assert.strictEqual(proximity("src/smart-open", "src/smart-open/picks"), 2 / 3);
    assert.strictEqual(proximity("src/smart-openers", "src/smart-open/picks"), 1 / 3, "a folder name prefix is not the folder");
    assert.strictEqual(proximity("lib", "src/smart-open/picks"), 0);
    assert.strictEqual(proximity("src", ""), 0, "a current file at the root says nothing about closeness");
  });
});
