import * as vscode from "vscode";
import type { Change, GitExtension } from "../git-file-decorator/git";
import { convertPredefinedVariables } from "../helpers/predefinedVariables";
import { createLineMapper } from "./lineMapping";

/**
 * Arguments of `vstoys.openFile`, usually given in a keybinding. All are optional.
 *
 * Without `filePath` the command opens the working-tree file behind the active editor: the file a
 * diff, a Git revision (built-in Git or GitLens), a multi-file diff or a merge editor shows. It
 * follows renames, and puts the cursor on the matching line of the current file.
 */
export interface OpenFileArgs {
  /** The file to open; supports `${file}`, `${workspaceFolder}`, `~/` and the other predefined variables. */
  filePath?: string;
  /** 1-based cursor line in the opened file; supports `${lineNumber}`. */
  line?: number | string;
  /** 1-based cursor column, used with `line`; supports `${columnNumber}`. */
  column?: number | string;
  /** Also run when the active tab already is the file: re-reveals it, pins a preview tab, closes other groups' copies. */
  alwaysOpen?: boolean;
  /** Carry over every selection and the scroll position, not only the cursor. */
  matchRange?: boolean;
  /** Close the tab the command ran from. Only text and diff tabs; multi-file diffs and merge editors stay open. */
  closePreviousEditor?: boolean;
  /** Close the opened file's tabs in other editor groups. */
  closeEditorInOtherGroups?: boolean;
}

export async function openFile(args: OpenFileArgs = {}): Promise<void> {
  try {
    // Resolve `${...}` variables before the first await: once the target opens, it is the active editor.
    const source = captureSource();
    const explicitPosition = args.line === undefined ? undefined : toExplicitPosition(args.line, args.column);
    const targetFollowsSource = args.filePath === undefined;

    let target: vscode.Uri;
    if (args.filePath !== undefined) {
      target = vscode.Uri.file(convertPredefinedVariables(args.filePath));
    } else if (source.locations.length === 0) {
      vscode.window.showInformationMessage("vstoys.openFile: the active editor doesn't show a file.");
      return;
    } else {
      const resolution = await resolveWorkingTreeFile(source.locations);
      if ("missing" in resolution) {
        const paths = [...new Set(resolution.missing.map((uri) => vscode.workspace.asRelativePath(uri)))];
        vscode.window.showWarningMessage(
          `vstoys.openFile: "${paths.join('" / "')}" isn't in the working tree (deleted, or only on another branch).`
        );
        return;
      }
      target = resolution.file;
    }

    const sourceIsTarget =
      source.tab?.input instanceof vscode.TabInputText && source.tab.input.uri.toString() === target.toString();
    if (sourceIsTarget && !args.alwaysOpen) {
      return;
    }

    // Open before closing anything: if opening fails, the user keeps the editor they started from.
    const targetColumn = source.group.viewColumn;
    const document = await vscode.workspace.openTextDocument(target);
    const editor = await vscode.window.showTextDocument(document, { viewColumn: targetColumn, preview: false });
    placeCursor(editor, { matchRange: args.matchRange, explicitPosition, cursor: source.cursor, targetFollowsSource });

    const tabsToClose: vscode.Tab[] = [];
    if (args.closePreviousEditor && source.tab && !sourceIsTarget) {
      const sourceTab = findSingleFileTab(source.tab);
      if (sourceTab) {
        tabsToClose.push(sourceTab);
      }
    }
    if (args.closeEditorInOtherGroups) {
      tabsToClose.push(
        ...vscode.window.tabGroups.all
          .filter((group) => group.viewColumn !== targetColumn)
          .flatMap((group) => group.tabs)
          .filter((tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === target.toString())
      );
    }
    if (tabsToClose.length > 0) {
      await vscode.window.tabGroups.close(tabsToClose, true);
    }
  } catch (error) {
    console.error("[openFile]:", error);
    vscode.window.showErrorMessage(`vstoys.openFile: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// #region Source: the tab the command runs from

/** The active tab and cursor, captured before anything opens or closes. */
interface Source {
  group: vscode.TabGroup;
  tab: vscode.Tab | undefined;
  /** Where the tab's documents live in the working tree, likeliest first. Empty when it shows no file. */
  locations: WorkingTreeLocation[];
  cursor: SourceCursor | undefined;
}

interface SourceCursor {
  document: vscode.TextDocument;
  selections: readonly vscode.Selection[];
  visibleRange: vscode.Range | undefined;
}

function captureSource(): Source {
  const group = vscode.window.tabGroups.activeTabGroup;
  const tab = group.activeTab;
  const tabUris = textDocumentUrisOf(tab);
  const editor = tabUris === undefined ? undefined : cursorEditorOf(group, tabUris);

  const documentUris = [
    // A cursor in a working-tree file means that file, even inside a diff of two different files.
    ...(editor?.document.uri.scheme === "file" ? [editor.document.uri] : []),
    // Otherwise the tab's newest side: a diff's modified side carries a renamed file's current name.
    ...(tabUris ?? []),
    ...(editor ? [editor.document.uri] : []),
  ];
  const uniqueUris = documentUris.filter(
    (uri, index) => documentUris.findIndex((other) => other.toString() === uri.toString()) === index
  );

  return {
    group,
    tab,
    locations: uniqueUris.map(toWorkingTreeLocation).filter((location) => location !== undefined),
    cursor: editor && {
      document: editor.document,
      selections: [...editor.selections],
      visibleRange: editor.visibleRanges[0],
    },
  };
}

/**
 * The documents a tab shows, newest first, or `undefined` when it isn't a text editor.
 * An empty array means a text editor the API doesn't describe (multi-file diff, merge editor).
 */
function textDocumentUrisOf(tab: vscode.Tab | undefined): vscode.Uri[] | undefined {
  const input = tab?.input;
  if (input instanceof vscode.TabInputText) {
    return [input.uri];
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return [input.modified, input.original];
  }
  if (
    tab === undefined ||
    input instanceof vscode.TabInputCustom ||
    input instanceof vscode.TabInputNotebook ||
    input instanceof vscode.TabInputNotebookDiff ||
    input instanceof vscode.TabInputWebview ||
    input instanceof vscode.TabInputTerminal
  ) {
    return undefined;
  }
  return [];
}

/** The active text editor, when it is part of the active tab (a diff has one per side). */
function cursorEditorOf(group: vscode.TabGroup, tabUris: readonly vscode.Uri[]): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || (editor.viewColumn !== undefined && editor.viewColumn !== group.viewColumn)) {
    return undefined;
  }
  // Tabs the API doesn't describe can't be cross-checked; trust the editor in their group.
  const editorUri = editor.document.uri.toString();
  return tabUris.length === 0 || tabUris.some((uri) => uri.toString() === editorUri) ? editor : undefined;
}

/** Finds `tab` again (`Tab` objects go stale when VS Code rebuilds its tab model), if it shows a single file. */
function findSingleFileTab(tab: vscode.Tab): vscode.Tab | undefined {
  const key = singleFileTabKey(tab.input);
  if (key === undefined) {
    return undefined;
  }
  return vscode.window.tabGroups.all
    .find((group) => group.viewColumn === tab.group.viewColumn)
    ?.tabs.find((candidate) => singleFileTabKey(candidate.input) === key);
}

function singleFileTabKey(input: unknown): string | undefined {
  if (input instanceof vscode.TabInputText) {
    return input.uri.toString();
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return `${input.original} <-> ${input.modified}`;
  }
  return undefined;
}

// #endregion

// #region Target: the working-tree file behind a document

/** The working-tree file a document URI points at, and the Git revision it shows (for following renames). */
interface WorkingTreeLocation {
  file: vscode.Uri;
  ref: string | undefined;
}

async function resolveWorkingTreeFile(
  locations: readonly WorkingTreeLocation[]
): Promise<{ file: vscode.Uri } | { missing: vscode.Uri[] }> {
  for (const { file } of locations) {
    if (await isFile(file)) {
      return { file };
    }
  }
  // Not under any of those names: the file may have been renamed since that revision (e.g. on another branch).
  // A Git error only matters if no revision finds the file.
  const lookedUp = new Set<string>();
  let lookupError: unknown;
  for (const { file, ref } of locations) {
    const key = `${ref} ${file}`;
    if (ref === undefined || lookedUp.has(key)) {
      continue;
    }
    lookedUp.add(key);
    try {
      const renamed = await findRenamedSince(file, ref);
      if (renamed && (await isFile(renamed))) {
        console.log(`[openFile]: followed rename since ${ref}: ${file.fsPath} -> ${renamed.fsPath}`);
        return { file: renamed };
      }
    } catch (error) {
      lookupError ??= error;
    }
  }
  if (lookupError !== undefined) {
    throw lookupError;
  }
  return { missing: locations.map((location) => location.file) };
}

function toWorkingTreeLocation(uri: vscode.Uri): WorkingTreeLocation | undefined {
  switch (uri.scheme) {
    case "file":
      return { file: uri, ref: undefined };
    case "git": {
      // Built-in Git: the query holds the real path (the URI path can carry a ".git" suffix) and the ref:
      // a commit or "HEAD", or "" / "~" / "~1".."~3" for the index and merge stages, which sit on top of HEAD.
      const query = parseJsonQuery(uri);
      const file = typeof query?.path === "string" ? vscode.Uri.file(query.path) : withoutRevision(uri);
      const ref = typeof query?.ref === "string" && query.ref !== "" && !query.ref.startsWith("~") ? query.ref : "HEAD";
      return { file, ref };
    }
    case "gitlens": {
      // GitLens: the URI path is the file's path; the query's ref has each "/" swapped for " ∕ ".
      const ref = parseJsonQuery(uri)?.ref;
      return {
        file: withoutRevision(uri),
        ref: typeof ref === "string" ? ref.replaceAll(" ∕ ", "/") : undefined,
      };
    }
    default: {
      // Other revision schemes usually keep the file's path as the URI path too. Scratch documents
      // (untitled, inmemory, output) don't name a file, so only trust paths inside the workspace.
      const file = withoutRevision(uri);
      return vscode.workspace.getWorkspaceFolder(file) ? { file, ref: undefined } : undefined;
    }
  }
}

function withoutRevision(uri: vscode.Uri): vscode.Uri {
  return uri.with({ scheme: "file", authority: "", query: "", fragment: "" });
}

/** Revision URIs carry JSON in their query; other queries yield undefined. */
function parseJsonQuery(uri: vscode.Uri): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(uri.query);
  } catch {
    return undefined;
  }
  return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
}

async function isFile(uri: vscode.Uri): Promise<boolean> {
  try {
    return ((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.File) !== 0;
  } catch (error) {
    if (error instanceof vscode.FileSystemError && ["FileNotFound", "FileNotADirectory"].includes(error.code)) {
      return false;
    }
    throw error;
  }
}

const GIT_STATUS_INDEX_RENAMED = 3; // `Status.INDEX_RENAMED` in the Git extension's API

/** Where `file` (as it was at `ref`) lives now, when Git detects it was renamed since. */
async function findRenamedSince(file: vscode.Uri, ref: string): Promise<vscode.Uri | undefined> {
  const gitExtension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  const git = await gitExtension?.activate();
  const repository = git?.enabled ? git.getAPI(1).getRepository(file) : null;
  if (!repository) {
    return undefined;
  }

  let changes: Change[];
  try {
    changes = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "Looking for the renamed file" },
      () => repository.diffWith(ref)
    );
  } catch (error) {
    // E.g. the commit is gone after a rebase. Report it rather than a misleading "not in the working tree".
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `couldn't check whether ${vscode.workspace.asRelativePath(file)} was renamed since ${ref}: ${reason}`,
      { cause: error }
    );
  }
  return changes.find(
    (change) => change.status === GIT_STATUS_INDEX_RENAMED && change.originalUri.fsPath === file.fsPath
  )?.uri;
}

// #endregion

// #region Cursor

/**
 * Puts the cursor where the user was. `matchRange` carries every selection and the scroll position;
 * otherwise an explicit `line` wins, and a target found from the source gets the source's cursor.
 * When the source shows another version of the file (a diff's HEAD side, an old commit), lines are
 * mapped through the changes.
 */
function placeCursor(
  editor: vscode.TextEditor,
  options: {
    matchRange: boolean | undefined;
    explicitPosition: vscode.Position | undefined;
    cursor: SourceCursor | undefined;
    targetFollowsSource: boolean;
  }
): void {
  const { matchRange, explicitPosition, cursor, targetFollowsSource } = options;
  const document = editor.document;
  const carryCursor = cursor !== undefined && (matchRange || (targetFollowsSource && explicitPosition === undefined));

  if (!carryCursor) {
    if (explicitPosition) {
      const position = document.validatePosition(explicitPosition);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
    return;
  }

  const mapLine =
    targetFollowsSource && cursor.document !== document
      ? createLineMapper(linesOf(cursor.document), linesOf(document))
      : (line: number) => line;
  const mapPosition = (position: vscode.Position) =>
    document.validatePosition(new vscode.Position(mapLine(position.line), position.character));
  const selections = matchRange ? cursor.selections : cursor.selections.slice(0, 1);
  editor.selections = selections.map(
    (selection) => new vscode.Selection(mapPosition(selection.anchor), mapPosition(selection.active))
  );

  if (matchRange && cursor.visibleRange) {
    const middleLine = Math.floor(
      (mapLine(cursor.visibleRange.start.line) + mapLine(cursor.visibleRange.end.line)) / 2
    );
    editor.revealRange(new vscode.Range(middleLine, 0, middleLine, 0), vscode.TextEditorRevealType.InCenter);
  } else {
    editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
}

function linesOf(document: vscode.TextDocument): string[] {
  return Array.from({ length: document.lineCount }, (_, line) => document.lineAt(line).text);
}

/** The 0-based position for the 1-based `line` and `column` arguments. */
function toExplicitPosition(line: number | string, column: number | string | undefined): vscode.Position {
  return new vscode.Position(
    toPositionNumber(line, "line") - 1,
    column === undefined ? 0 : toPositionNumber(column, "column") - 1
  );
}

function toPositionNumber(value: number | string, name: "line" | "column"): number {
  const number = typeof value === "number" ? value : parseInt(convertPredefinedVariables(value), 10);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive whole number, got "${value}"`);
  }
  return number;
}

// #endregion
