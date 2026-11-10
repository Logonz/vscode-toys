import * as assert from "assert";
import { hasMatch, matchQuality, matchQualityCeiling } from "../../smart-open/fzy";

// Worked examples use fzy's rules (scaled by 1000): a match right after "/" or at the start earns 900, after
// "-" 800, at a camelCase hump 700, consecutive 1000; each skipped character costs 5 before the first match
// or after the last, 10 in between. Quality is the score over the best possible, 900 + 1000 per extra character.

suite("smart-open fzy", () => {
  test("an exact match is a perfect match", () => {
    // The previous scorer returned 0 here, so typing a root file's full name ranked it below partial matches.
    assert.strictEqual(matchQuality("main.ts", "main.ts", "main.ts"), 1);
  });

  test("worked example: a consecutive match after a slash, then trailing gaps", () => {
    // "a" at index 4 after "/": 900 - 4 × 5 = 880; "b" consecutive: + 1000; ".ts" trails: - 3 × 5.
    assert.strictEqual(matchQuality("ab", "src/ab.ts", "src/ab.ts"), (880 + 1000 - 15) / 1900);
  });

  test("worked example: a consecutive pair beats a better start with a gap", () => {
    // "a" at 0 then "b" at 4: 900 - 3 × 10 (inner gaps) + 0 = 870. "a" at 3, "b" at 4: -15 + 1000 = 985.
    assert.strictEqual(matchQuality("ab", "a/xab", "a/xab"), 985 / 1900);
  });

  test("worked example: skipped characters between matches cost 10 each", () => {
    // "a" at 0: 900; "-" and "x" are skipped: -20; "b" after "x" has no bonus; nothing trails.
    assert.strictEqual(matchQuality("ab", "a-xb", "a-xb"), (900 - 20) / 1900);
  });

  test("matching at the start of a path segment beats matching mid-word", () => {
    const atSegment = matchQuality("ma", "src/main.ts", "src/main.ts");
    const midWord = matchQuality("ma", "src/format.ts", "src/format.ts");
    assert.ok(atSegment > midWord, `${atSegment} should beat ${midWord}`);
  });

  test("camelCase humps come from the original casing", () => {
    const withHumps = matchQuality("lw", "filelistwithfuzzy.ts", "fileListWithFuzzy.ts");
    const withoutHumps = matchQuality("lw", "filelistwithfuzzy.ts", "filelistwithfuzzy.ts");
    assert.ok(withHumps > withoutHumps, `${withHumps} should beat ${withoutHumps}`);
  });

  test("one-character queries: the best bonus minus 5 per other character", () => {
    assert.strictEqual(matchQuality("m", "src/main.ts", "src/main.ts"), (900 - 50) / 900);
    // "l" at index 2 has no bonus, but "L" at index 4 is a camelCase hump (700).
    assert.strictEqual(matchQuality("l", "filelist.ts", "fileList.ts"), (700 - 50) / 900);
    // No bonus anywhere: only the gap penalty, floored at 0.
    assert.strictEqual(matchQuality("x", "a".repeat(300) + "x", "a".repeat(300) + "x"), 0);
  });

  test("the ceiling is never below the real quality, so ranking never skips a file that belongs in the results", () => {
    const haystacks = [
      "src/smart-open/picks/fileListWithFuzzy.ts",
      "node_modules/@types/vscode/index.d.ts",
      "a/b/c/d/e/f/g/h.md",
      "README.md",
      "packages/pkg-one/src/some_module/AnotherFile.test.tsx",
    ];
    let checked = 0;
    for (const original of haystacks) {
      const comparable = original.toLowerCase();
      // Every contiguous slice and every every-other-character subsequence, as needles.
      for (let start = 0; start < comparable.length; start++) {
        for (let end = start + 1; end <= comparable.length; end++) {
          const slice = comparable.slice(start, end);
          for (const needle of [slice, [...slice].filter((_, i) => i % 2 === 0).join("")]) {
            if (hasMatch(needle, comparable)) {
              const quality = matchQuality(needle, comparable, original);
              const ceiling = matchQualityCeiling(needle.length, comparable.length);
              assert.ok(quality <= ceiling + 1e-12, `"${needle}" in "${original}": ${quality} > ${ceiling}`);
              checked++;
            }
          }
        }
      }
    }
    assert.ok(checked > 1000);
  });

  test("a match needs every character, in order", () => {
    assert.strictEqual(hasMatch("flwf", "filelistwithfuzzy.ts"), true);
    assert.strictEqual(hasMatch("fwl", "filelistwithfuzzy.ts"), false);
  });
});
