import { globToRegExp } from "../helpers/simpleGlob";

/**
 * The enabled patterns of exclude settings shaped like `files.exclude` (`{ [glob]: boolean | { when } }`).
 * Patterns with a `when` condition are skipped: they depend on sibling files, which this matcher cannot see.
 */
export function enabledPatterns(...settings: (Record<string, unknown> | undefined)[]): string[] {
  return settings.flatMap((setting) =>
    Object.entries(setting ?? {})
      .filter(([, enabled]) => enabled === true)
      .map(([pattern]) => pattern)
  );
}

/** `**\/name`: matches one path segment anywhere, so it can be tested against the last segment alone. */
const ANY_DEPTH_NAME = /^\*\*\/[^/]+$/;

/**
 * Tests folder-relative, `/`-separated file paths. A file is excluded when its path or any parent folder
 * matches a pattern, as in VS Code (`**\/node_modules` hides everything inside node_modules).
 */
export function createExcludeTest(
  patterns: readonly string[],
  onInvalidPattern: (pattern: string, error: unknown) => void
): (relativePath: string) => boolean {
  const nameSources: string[] = [];
  const pathSources: string[] = [];
  for (const pattern of patterns) {
    try {
      // Testing `**/name` against whole paths makes the regex backtrack over every folder: slow at 200k files.
      if (ANY_DEPTH_NAME.test(pattern)) {
        nameSources.push(`(?:${globToRegExp(pattern.slice(3)).source})`);
      } else {
        pathSources.push(`(?:${globToRegExp(pattern).source})`);
      }
    } catch (error) {
      onInvalidPattern(pattern, error); // e.g. `[z-a]`; the other patterns still apply
    }
  }
  if (nameSources.length === 0 && pathSources.length === 0) {
    return () => false;
  }
  const anyName = nameSources.length > 0 ? new RegExp(nameSources.join("|")) : undefined;
  const anyPath = pathSources.length > 0 ? new RegExp(pathSources.join("|")) : undefined;
  const matches = (path: string, nameStart: number): boolean =>
    (anyName?.test(path.slice(nameStart)) ?? false) || (anyPath?.test(path) ?? false);

  // Many files share a folder, so each folder is tested once.
  const folderExcluded = new Map<string, boolean>();
  const isFolderExcluded = (folder: string): boolean => {
    let excluded = folderExcluded.get(folder);
    if (excluded === undefined) {
      const parentEnd = folder.lastIndexOf("/");
      excluded = (parentEnd !== -1 && isFolderExcluded(folder.slice(0, parentEnd))) || matches(folder, parentEnd + 1);
      folderExcluded.set(folder, excluded);
    }
    return excluded;
  };

  return (relativePath) => {
    const folderEnd = relativePath.lastIndexOf("/");
    return (folderEnd !== -1 && isFolderExcluded(relativePath.slice(0, folderEnd))) || matches(relativePath, folderEnd + 1);
  };
}
