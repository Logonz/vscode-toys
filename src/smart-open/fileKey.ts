/** VS Code treats file paths as case-insensitive on Windows and macOS. */
const caseInsensitivePaths = process.platform !== "linux";

/**
 * The identity smart-open uses to join the file index with history, open tabs and git changes,
 * so `D:\Projekt\a.ts` and `d:\projekt\a.ts` count as one file where the OS says they are.
 */
export function fileKey(fsPath: string): string {
  return caseInsensitivePaths ? fsPath.toLowerCase() : fsPath;
}
