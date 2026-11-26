/** VS Code treats file paths as case-insensitive on Windows and macOS. */
const caseInsensitivePaths = process.platform !== "linux";

/**
 * The identity smart-open uses to join the file index with history, open tabs and git changes,
 * so `D:\Projekt\a.ts` and `d:\projekt\a.ts` count as one file where the OS says they are.
 */
export function fileKey(fsPath: string): string {
  return caseInsensitivePaths ? fsPath.toLowerCase() : fsPath;
}

/**
 * Where `uriPath` sits inside `folderPath`, `/`-separated. Both are `Uri.path` values, and the caller has already
 * established that the file is inside the folder (`findFiles` in a `RelativePattern`, `getWorkspaceFolder`).
 *
 * Not `path.posix.relative`, which compares case-sensitively: VS Code lowercases the drive letter of the URIs it
 * builds (`/c:/…` from `findFiles`) while a folder opened as `C:\…` keeps `/C:/…`, so every path came out as
 * `../../../c:/…`.
 */
export function pathInFolder(folderPath: string, uriPath: string): string {
  return uriPath.slice(folderPath.endsWith("/") ? folderPath.length : folderPath.length + 1);
}
