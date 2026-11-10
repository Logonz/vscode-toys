/** Parsers for git's NUL-separated (`-z`) output, which leaves paths unquoted and unescaped. */

/**
 * Files from `git ls-files -z --stage -t`, without those a sparse checkout left off disk (tag `S`) or
 * uninitialized submodules (mode 160000, a folder). Each entry is "<tag> <mode> <object> <stage>\t<path>";
 * a conflicted file has one entry per side, so paths are deduplicated.
 */
export function parseTrackedFiles(output: string): string[] {
  const files = new Set<string>();
  for (const entry of splitNul(output)) {
    if (!entry.startsWith("S ") && !entry.startsWith("160000 ", 2)) {
      files.add(entry.slice(entry.indexOf("\t") + 1));
    }
  }
  return [...files];
}

/** `git ls-files -z --others --exclude-standard`: untracked files, and nested repositories as "folder/". */
export function parseUntrackedFiles(output: string): { files: string[]; nestedRepositories: string[] } {
  const files: string[] = [];
  const nestedRepositories: string[] = [];
  for (const entry of splitNul(output)) {
    (entry.endsWith("/") ? nestedRepositories : files).push(entry);
  }
  return { files, nestedRepositories };
}

/**
 * The changed paths in `git show -z --name-status --format=` output: NUL-separated "status, path" pairs,
 * with two paths for renames and copies (`R100`, `C75`), of which the new one is returned.
 */
export function parseNameStatusPaths(output: string): string[] {
  const tokens = output.split("\0");
  const paths: string[] = [];
  for (let i = 0; i < tokens.length; ) {
    const status = tokens[i].trim(); // Commits may be separated by a newline.
    if (status.length === 0) {
      i++;
      continue;
    }
    const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
    const changedPath = tokens[i + pathCount];
    if (changedPath) {
      paths.push(changedPath);
    }
    i += 1 + pathCount;
  }
  return paths;
}

function splitNul(output: string): string[] {
  return output.split("\0").filter((entry) => entry.length > 0);
}
