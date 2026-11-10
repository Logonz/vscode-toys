/**
 * The subset of the built-in Git extension's API (`vscode.git`, `getAPI(1)`) that vstoys uses
 * (the file decorator, and `vstoys.openFile` for following renames).
 * Copied from VS Code's extensions/git/src/api/git.d.ts; keep names in sync with that file when adding members.
 */
import type { Event, Uri } from "vscode";

export interface GitExtension {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: Event<boolean>;
  /** Throws while `enabled` is false, and inside `onDidChangeEnablement(true)` listeners (it fires before the API is ready). */
  getAPI(version: 1): API;
}

export interface API {
  readonly git: { readonly path: string };
  /** Returns new wrapper objects on every access, so compare repositories by `rootUri`, not identity. */
  readonly repositories: Repository[];
  readonly onDidOpenRepository: Event<Repository>;
  readonly onDidCloseRepository: Event<Repository>;
  /** The open repository containing `uri` (matched by path, so the file need not exist), or null. */
  getRepository(uri: Uri): Repository | null;
}

export interface Repository {
  readonly rootUri: Uri;
  readonly state: RepositoryState;
  /** Files that differ between `ref` and the working tree (`git diff --name-status <ref>`), renames included. */
  diffWith(ref: string): Promise<Change[]>;
}

export interface RepositoryState {
  /** `commit` is undefined until the repository has its first commit. */
  readonly HEAD: { readonly commit?: string } | undefined;
  readonly mergeChanges: Change[];
  readonly indexChanges: Change[];
  readonly workingTreeChanges: Change[];
  readonly untrackedChanges: Change[];
  /** Fires after every status refresh, including ones where nothing changed. */
  readonly onDidChange: Event<void>;
}

export interface Change {
  /** The file's current path (the new path for renames). */
  readonly uri: Uri;
  /** The file's path before the change (the old path for renames). */
  readonly originalUri: Uri;
  /** A value of the Git extension's `Status` enum, e.g. 3 (INDEX_RENAMED) for renames. */
  readonly status: number;
}
