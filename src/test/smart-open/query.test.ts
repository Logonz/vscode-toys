import * as assert from "assert";
import { matchFile, narrowsSearch, parseQuery, queryConfidence, virtualName, type MatchableFile } from "../../smart-open/query";

function file(relativePath: string, customLabel?: string): MatchableFile {
  const matchName = customLabel ?? virtualName(relativePath);
  return {
    relativePath,
    relativePathLower: relativePath.toLowerCase(),
    matchName,
    matchNameLower: matchName.toLowerCase(),
  };
}

function matches(query: string, target: MatchableFile): boolean {
  return matchFile(parseQuery(query), target) !== undefined;
}

suite("smart-open query", () => {
  const picker = file("src/smart-open/picks/fileListWithFuzzy.ts");

  test("each word matches fuzzily, and every word must match", () => {
    assert.ok(matches("flwf", picker));
    assert.ok(matches("pick fuzzy", picker));
    assert.ok(matches("fuzzy pick", picker), "word order does not matter");
    assert.ok(!matches("pick zebra", picker));
  });

  test("fzf operators: 'exact, ^prefix, suffix$, ^equal$ and !exclude", () => {
    assert.ok(!matches("'flwf", picker), "exact needs a contiguous substring");
    assert.ok(matches("'listwith", picker));
    assert.ok(matches("^src/smart", picker));
    assert.ok(!matches("^smart", picker));
    assert.ok(matches(".ts$", picker));
    assert.ok(!matches(".js$", picker));
    assert.ok(matches("^src/smart-open/picks/filelistwithfuzzy.ts$", picker));
    assert.ok(!matches("^src/smart-open$", picker));
    assert.ok(!matches("fuzzy !picks", picker));
    assert.ok(matches("fuzzy !test", picker));
    assert.ok(!matches("!^src", picker));
  });

  test("smart case: an uppercase letter makes that word case-sensitive", () => {
    assert.ok(matches("List", picker));
    assert.ok(!matches("LIST", picker));
    assert.ok(matches("LIST", file("docs/LIST.md")));
  });

  test("a word may match a custom label that is not in the path", () => {
    const labelled = file("src/api/index.ts", "API entry");
    const result = matchFile(parseQuery("entry"), labelled);
    assert.ok(result, "the label alone is enough to match");
    assert.strictEqual(result.path, 0);
    assert.ok(result.name > 0);
  });

  test("the match counts in proportion to typed characters until there are six", () => {
    assert.strictEqual(queryConfidence(parseQuery("m")), 1 / 6);
    assert.strictEqual(queryConfidence(parseQuery("ma in")), 4 / 6, "spaces do not count");
    assert.strictEqual(queryConfidence(parseQuery("main.ts")), 1);
    const one = matchFile(parseQuery("m"), file("main.ts"));
    const full = matchFile(parseQuery("main.ts"), file("main.ts"));
    assert.ok(one && full && one.name < full.name / 2, "one letter says much less than the whole name");
  });

  test("filters narrow the results without changing how well a file matched", () => {
    const target = file("src/main.ts");
    assert.deepStrictEqual(matchFile(parseQuery("main .ts$ !test ^src"), target), matchFile(parseQuery("main"), target));
  });

  test("a lone operator character is not a term", () => {
    assert.deepStrictEqual(parseQuery("! ^ '"), []);
    assert.ok(matches("!", picker));
  });

  test("only added characters that cannot match more files narrow a search", () => {
    assert.ok(narrowsSearch("ind", "inde"));
    assert.ok(narrowsSearch("ind", "ind mod"), "another word is another AND");
    assert.ok(narrowsSearch("ab", "abC"), "a word turning case-sensitive still needs its letters");
    assert.ok(!narrowsSearch("inde", "ind"), "deleting a character can match more");
    // Counterexamples: each new query matches a file the previous one did not.
    const tsFile = file("src/app.ts");
    assert.ok(matches("!tsx", tsFile) && !matches("!ts", tsFile));
    assert.ok(!narrowsSearch("!ts", "!tsx"));
    const dollarFile = file("src/ts$x.md");
    assert.ok(matches("ts$x", dollarFile) && !matches("ts$", dollarFile));
    assert.ok(!narrowsSearch("ts$", "ts$x"));
  });

  test("generic file names include their folder", () => {
    assert.strictEqual(virtualName("src/components/button/index.ts"), "button/index.ts");
    assert.strictEqual(virtualName("index.ts"), "index.ts");
    assert.strictEqual(virtualName("src/app.ts"), "app.ts");
    assert.ok(matches("button index", file("src/components/button/index.ts")));
  });
});
