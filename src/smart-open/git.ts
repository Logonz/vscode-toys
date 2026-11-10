import * as vscode from "vscode";
import { spawn } from "child_process";
import type { API, GitExtension } from "../git-file-decorator/git";
import { getBranchChangedFiles } from "../git-file-decorator/main";
import { fileKey } from "./fileKey";

/** The built-in Git extension's API, or undefined while that extension is disabled, inactive or still starting. */
function gitApi(): API | undefined {
  const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!extension?.isActive || !extension.exports.enabled) {
    return undefined;
  }
  try {
    return extension.exports.getAPI(1);
  } catch {
    return undefined; // Expected briefly while the Git extension starts; callers fall back.
  }
}

/** Generous for listing a giant repository, but a hung git must not leave the index building forever. */
const GIT_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Runs git (the Git extension's binary when available) without a shell. Resolves with stdout and rejects with
 * stderr in the message. Output is unbounded, since listing a giant repository returns megabytes of paths.
 */
export function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(gitApi()?.git.path ?? "git", args, { cwd, windowsHide: true, timeout: GIT_TIMEOUT_MS });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject); // e.g. git is not installed
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
        return;
      }
      const command = `git ${args.slice(0, 3).join(" ")}`; // `git show` gets hundreds of commit ids
      const outcome = code === null ? `was stopped (${signal}), likely after ${GIT_TIMEOUT_MS / 1000}s` : `exited with ${code}`;
      reject(new Error(`${command} ${outcome}: ${Buffer.concat(stderr).toString("utf8").trim()}`));
    });
  });
}

/** `Status.DELETED` in the Git extension's API: deleted in the working tree, not yet staged. */
const STATUS_DELETED = 6;

/** Keys of files deleted from disk but still in git's index, from the Git extension's last status. */
export function deletedFileKeys(): Set<string> {
  const keys = new Set<string>();
  for (const repository of gitApi()?.repositories ?? []) {
    for (const change of repository.state.workingTreeChanges) {
      if (change.status === STATUS_DELETED) {
        keys.add(fileKey(change.uri.fsPath));
      }
    }
  }
  return keys;
}

/** Keys of files with uncommitted changes, plus files the branch changed (when the git file decorator runs). */
export function changedFileKeys(): Set<string> {
  const keys = new Set<string>();
  for (const uri of getBranchChangedFiles()) {
    keys.add(fileKey(uri.fsPath));
  }
  for (const repository of gitApi()?.repositories ?? []) {
    const { mergeChanges, indexChanges, workingTreeChanges, untrackedChanges } = repository.state;
    for (const change of [...mergeChanges, ...indexChanges, ...workingTreeChanges, ...untrackedChanges]) {
      keys.add(fileKey(change.uri.fsPath));
    }
  }
  return keys;
}
