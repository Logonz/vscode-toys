import * as assert from "assert";
import { createExcludeTest, enabledPatterns } from "../../smart-open/exclude";

function failOnInvalid(pattern: string): never {
  throw new Error(`unexpected invalid pattern ${pattern}`);
}

suite("smart-open excludes", () => {
  test("a file is excluded when it or any parent folder matches", () => {
    const isExcluded = createExcludeTest(["**/node_modules", "dist", "**/*.log", "out/**"], failOnInvalid);
    assert.ok(isExcluded("node_modules/a/index.js"));
    assert.ok(isExcluded("packages/x/node_modules/y.js"));
    assert.ok(isExcluded("dist/bundle.js"));
    assert.ok(isExcluded("logs/today.log"));
    assert.ok(isExcluded("out/test/a.js"));
    assert.ok(!isExcluded("src/dist/x.js"), "a pattern without ** only matches at the folder root");
    assert.ok(!isExcluded("src/node_modules_helper.ts"));
    assert.ok(!isExcluded("src/output.ts"));
  });

  test("brace alternatives are globs too", () => {
    const isExcluded = createExcludeTest(["{**/dist,**/out}", "**/*.{js,map}"], failOnInvalid);
    assert.ok(isExcluded("packages/a/dist/index.d.ts"));
    assert.ok(isExcluded("out/x.ts"));
    assert.ok(isExcluded("src/bundle.js"));
    assert.ok(isExcluded("src/bundle.js.map"));
    assert.ok(!isExcluded("src/bundle.ts"));
    assert.ok(!isExcluded("src/distance.ts"));
  });

  test("an invalid pattern is reported and skipped, and the others still apply", () => {
    const invalid: string[] = [];
    const isExcluded = createExcludeTest(["[z-a]", "dist"], (pattern) => invalid.push(pattern));
    assert.deepStrictEqual(invalid, ["[z-a]"]);
    assert.ok(isExcluded("dist/bundle.js"));
    assert.ok(!isExcluded("src/a.ts"));
  });

  test("only patterns set to true apply", () => {
    const patterns = enabledPatterns(
      { "**/.git": true, "**/*.js": { when: "$(basename).ts" }, tmp: false },
      undefined,
      { "**/node_modules": true }
    );
    assert.deepStrictEqual(patterns, ["**/.git", "**/node_modules"]);
  });
});
