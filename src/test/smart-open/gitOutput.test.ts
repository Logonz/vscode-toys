import * as assert from "assert";
import { parseNameStatusPaths, parseTrackedFiles, parseUntrackedFiles } from "../../smart-open/gitOutput";

// Fixtures are real output from a scratch repository with a sparse checkout of `a/`, a submodule at
// vendor/sub, and a non-ASCII file name, as produced by `git ls-files -z --stage -t --recurse-submodules`.
const SPARSE_WITH_SUBMODULE = [
  "S 100644 447900621ab167adfe04920cf451e443dde4130d 0\t.gitmodules",
  "H 100644 587be6b4c3f93f93c489c0111bba5596147a26cb 0\ta/x.txt",
  "S 100644 975fbec8256d3e8a3797e7a3611380f27c49f4ac 0\tb/y.txt",
  "S 100644 b68025345d5301abad4d9ec9166f455243a0d746 0\tpages-ü.txt",
  "H 100644 b4785957bc986dc39c629de9fac9df46972c00fc 0\tvendor/sub/s.txt",
  "",
].join("\0");

suite("smart-open git output", () => {
  test("tracked files skip what a sparse checkout left off disk, and include submodule files", () => {
    assert.deepStrictEqual(parseTrackedFiles(SPARSE_WITH_SUBMODULE), ["a/x.txt", "vendor/sub/s.txt"]);
  });

  test("an uninitialized submodule is a folder, not a file; a conflicted file is listed once", () => {
    const output = [
      "H 160000 08f6a68a8df95ac05a98beb9065945044525ed43 0\tvendor/sub",
      "M 100644 1111111111111111111111111111111111111111 1\tsrc/conflict.ts",
      "M 100644 2222222222222222222222222222222222222222 2\tsrc/conflict.ts",
      "M 100644 3333333333333333333333333333333333333333 3\tsrc/conflict.ts",
      "H 100644 4444444444444444444444444444444444444444 0\tpath with\ttab.md",
      "",
    ].join("\0");
    assert.deepStrictEqual(parseTrackedFiles(output), ["src/conflict.ts", "path with\ttab.md"]);
  });

  test("untracked output separates nested repositories (trailing slash) from files", () => {
    assert.deepStrictEqual(parseUntrackedFiles("new.ts\0tools/nested-repo/\0docs/notes.md\0"), {
      files: ["new.ts", "docs/notes.md"],
      nestedRepositories: ["tools/nested-repo/"],
    });
  });

  test("name-status output yields each changed path, the new one for renames and copies", () => {
    // `git show -z --name-status --format=` over two commits, as captured: "M a/x.txt", then "A .gitmodules", "A vendor/sub".
    assert.deepStrictEqual(parseNameStatusPaths("M\0a/x.txt\0A\0.gitmodules\0A\0vendor/sub\0"), [
      "a/x.txt",
      ".gitmodules",
      "vendor/sub",
    ]);
    assert.deepStrictEqual(parseNameStatusPaths("\nR100\0old/name.ts\0new/name.ts\0C75\0a.ts\0b.ts\0D\0gone.ts\0"), [
      "new/name.ts",
      "b.ts",
      "gone.ts",
    ]);
  });
});
