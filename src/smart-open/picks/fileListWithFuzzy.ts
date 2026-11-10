import * as vscode from "vscode";
import { IsCustomLabelsEnabled } from "../../helpers/customEditorLabelService";
import type { CoChangeCache } from "../coChange";
import { fileUri, locate, type FileIndex, type FileLocation, type IndexedFile } from "../fileIndex";
import { changedFileKeys } from "../git";
import type { AccessHistory } from "../history";
import type { LearnedRanking, ShownResult } from "../learning";
import { narrowsSearch, parseQuery } from "../query";
import {
  baseScore,
  rank,
  SIGNALS,
  signalValues,
  type RankedFile,
  type Ranking,
  type RankingContext,
  type Weights,
} from "../ranking";
import { InlineInput } from "./InlineInput";

/** Nobody scrolls further, and sending fewer items keeps the QuickPick fast in giant repositories. */
const RESULT_LIMIT = 300;
const BASE_TITLE = "Smart Open";
const SEARCHING_CONTEXT = "vstoys.smart-open.searching";

// Default vscode commands for quick pick navigation
const QUICK_COMMANDS: Record<string, string> = {
  ">": "workbench.action.showCommands", // If the user types >, show the command palette
  "%": "workbench.action.quickTextSearch", // If the user types %, show quick text search
  "#": "workbench.action.showAllSymbols", // If the user types #, go to symbol workspace
  "@": "workbench.action.gotoSymbol", // If the user types @, go to symbol in file
  ":": "workbench.action.gotoLine", // If the user types :, go to line
};

export interface PickerServices {
  readonly index: FileIndex;
  readonly history: AccessHistory;
  readonly learning: LearnedRanking;
  readonly coChange: CoChangeCache;
}

interface FileQuickPickItem extends vscode.QuickPickItem {
  readonly file: IndexedFile;
}

let services: PickerServices;
let openPicker: PickerSession | undefined;
/** True while the first file index is being built for a picker that is about to open. */
let waitingForIndex = false;

/** Call once on activation, before the first `showQuickPickWithInlineSearch()`. */
export function initializeSmartOpenPicker(pickerServices: PickerServices): vscode.Disposable[] {
  services = pickerServices;
  const disposables: vscode.Disposable[] = [
    services.index.onDidUpdate(() => openPicker?.refresh()),
    { dispose: () => openPicker?.end() },
  ];
  if (process.env.NODE_ENV !== "development") {
    disposables.push(
      vscode.window.onDidChangeWindowState((event) => {
        if (!event.focused) {
          openPicker?.end();
        }
      })
    );
  }
  return disposables;
}

export async function showQuickPickWithInlineSearch(): Promise<void> {
  if (openPicker || waitingForIndex) {
    return; // Already open, or about to be.
  }
  // The first build must finish before there is anything to show; later ones run behind the open picker.
  if (!services.index.hasBuilt) {
    waitingForIndex = true;
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: "Smart Open: indexing files" },
        () => services.index.refreshIfNeeded()
      );
    } finally {
      waitingForIndex = false;
    }
  } else {
    void services.index.refreshIfNeeded();
  }

  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showErrorMessage("No active editor found");
    return;
  }
  const picker = new PickerSession(activeEditor);
  openPicker = picker;
  try {
    await picker.start();
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to start inline search: ${error}`);
    picker.end();
  }
}

/** Ranking data that stays the same while the picker is open, until the file index or co-change data updates. */
interface RankingData {
  readonly files: readonly IndexedFile[];
  readonly context: RankingContext;
  readonly weights: Weights;
  /** `baseScore()` of each file in `files`. */
  readonly baseScores: Float64Array;
}

/** One open picker: its QuickPick, the input capture, the commands bound while it is open, and its ranking. */
class PickerSession {
  private readonly quickPick = vscode.window.createQuickPick<FileQuickPickItem>();
  private readonly disposables: vscode.Disposable[] = [this.quickPick];
  private input: InlineInput | undefined;
  private data: RankingData;
  private ranking: Ranking = { results: [], matches: new Int32Array(0) };
  /** The input `ranking` is for; undefined until the first search after (re)creating `data`. */
  private rankedInput: string | undefined;
  private selectedIndex = 0;
  private searchPending = false;
  private ended = false;

  constructor(private readonly editor: vscode.TextEditor) {
    this.quickPick.matchOnDescription = false;
    this.quickPick.matchOnDetail = false;
    // this.quickPick.enabled = false; // This works and is good, but it disables mouse interactions
    this.quickPick.ignoreFocusOut = true;
    this.quickPick.title = BASE_TITLE;
    this.quickPick.placeholder = `Select file to open - Custom Labels ${IsCustomLabelsEnabled() ? "ENABLED" : "DISABLED"}`;
    this.data = createRankingData(editor);
  }

  async start(): Promise<void> {
    // Set context to enable search keybindings
    await vscode.commands.executeCommand("setContext", SEARCHING_CONTEXT, true);
    if (this.ended) {
      return; // Closed while waiting (e.g. the window lost focus); end() already reset the context.
    }

    // Start with empty search to show all files; this shows the QuickPick and gives focus back to the editor.
    this.search("");

    this.input = new InlineInput({
      textEditor: this.editor,
      onInput: (input, char) => this.onInput(input, char),
      onCancel: () => this.end(),
    });

    this.disposables.push(
      this.quickPick.onDidChangeValue((value) => {
        // Typing reached the QuickPick's own input (e.g. after a click into it): forward it, keep the value
        // empty so VS Code does not re-sort, and give focus back to the editor where InlineInput listens.
        if (value.length > 0) {
          this.input?.handleDirectInput(value);
        }
        this.quickPick.value = "";
        const activeEditor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0];
        if (activeEditor) {
          vscode.window.showTextDocument(activeEditor.document);
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => this.end()),
      vscode.commands.registerCommand("vstoys.smart-open.navigateUp", () => {
        if (this.selectedIndex > 0) {
          this.selectedIndex--;
          this.updateSelection();
        }
      }),
      vscode.commands.registerCommand("vstoys.smart-open.navigateDown", () => {
        if (this.selectedIndex < this.quickPick.items.length - 1) {
          this.selectedIndex++;
          this.updateSelection();
        }
      }),
      vscode.commands.registerCommand("vstoys.smart-open.selectFile", () => {
        if (this.searchPending) {
          this.runSearch(false); // Enter right after typing picks from the results for what was typed.
        }
        this.open(this.selectedIndex);
      }),
      vscode.commands.registerCommand("vstoys.smart-open.deleteChar", () => {
        this.input?.deleteLastCharacter();
        this.scheduleSearch();
      }),
      vscode.commands.registerCommand("vstoys.smart-open.paste", async () => {
        const clipboardText = await vscode.env.clipboard.readText();
        this.input?.pasteText(clipboardText); // Searches through onInput.
      }),
      // A click picks what was shown, so no pending search runs first.
      this.quickPick.onDidAccept(() => {
        const item = this.quickPick.selectedItems[0] ?? this.quickPick.items[this.selectedIndex];
        this.open(this.quickPick.items.indexOf(item));
      }),
      this.quickPick.onDidHide(() => this.end())
    );

    this.updateSelection();
    this.input.updateStatusBar("Search files...", true);
  }

  /** Closes the picker and releases everything it bound. Safe to call any number of times, from any path. */
  end(): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    if (openPicker === this) {
      openPicker = undefined;
    }
    this.disposables.forEach((disposable) => disposable.dispose()); // Disposing the QuickPick hides it.
    this.input?.destroy(); // Calls onCancel, which returns here and stops at `ended`.
    void vscode.commands.executeCommand("setContext", SEARCHING_CONTEXT, false);
  }

  /** Re-ranks after the file index or co-change data changed, keeping the highlighted file if it is still listed. */
  refresh(): void {
    if (this.ended) {
      return;
    }
    this.data = createRankingData(this.editor);
    this.rankedInput = undefined;
    this.runSearch(true);
  }

  private onInput(input: string, char: string): void {
    // If the user types a quick command, execute it
    if (QUICK_COMMANDS[char] && input === char) {
      this.end();
      vscode.commands.executeCommand(QUICK_COMMANDS[char]);
      return;
    }
    this.scheduleSearch();
  }

  /** Keystrokes that arrive faster than ranking runs share one search of the latest input. */
  private scheduleSearch(): void {
    if (!this.searchPending) {
      this.searchPending = true;
      setImmediate(() => this.runSearch(false));
    }
  }

  /** Ranks the current input and shows it; `keepSelection` keeps the highlighted file if it is still listed. */
  private runSearch(keepSelection: boolean): void {
    this.searchPending = false;
    if (this.ended || !this.input) {
      return;
    }
    const selectedKey = keepSelection ? this.quickPick.items[this.selectedIndex]?.file.key : undefined;
    this.search(this.input.input);
    this.selectedIndex = Math.max(0, this.quickPick.items.findIndex((item) => item.file.key === selectedKey));
    this.updateSelection();
  }

  private search(input: string): void {
    // Typing on narrows the previous matches, so only the first keystrokes scan the whole workspace.
    const candidates =
      this.rankedInput !== undefined && narrowsSearch(this.rankedInput, input) ? this.ranking.matches : undefined;
    const { files, baseScores, weights } = this.data;
    this.ranking = rank(files, baseScores, parseQuery(input), weights, RESULT_LIMIT, candidates);
    this.rankedInput = input;

    const showDetails = vscode.workspace.getConfiguration("vstoys.smart-open").get("debugDetails", false);
    this.quickPick.items = this.ranking.results.map((result) => this.toItem(result, showDetails));

    // Showing the QuickPick takes focus, but typing only reaches InlineInput through the editor.
    const activeEditorForQuickPick = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0];
    this.quickPick.show();
    if (activeEditorForQuickPick) {
      vscode.window.showTextDocument(activeEditorForQuickPick.document);
    }
  }

  // Update QuickPick selection
  private updateSelection(): void {
    const items = this.quickPick.items;
    const matchCount = this.ranking.matches.length;
    if (items.length > 0) {
      this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, items.length - 1));
      this.quickPick.activeItems = [items[this.selectedIndex]];

      if (this.input) {
        this.input.updateStatusBar(`${this.input.input} [${this.selectedIndex + 1}/${matchCount}]`, true);
        this.quickPick.title = `${BASE_TITLE} - [${this.selectedIndex + 1}/${matchCount}]`;
        this.quickPick.placeholder = this.input.input;
      }
    } else if (this.input) {
      // No found items
      this.quickPick.title = `${BASE_TITLE} - [0/0]`;
      this.quickPick.placeholder = this.input.input;
    }
  }

  /** Opens the result at `position` and teaches the ranking from the pick. */
  private open(position: number): void {
    const item = this.quickPick.items[position];
    if (!item) {
      return;
    }
    this.learnFromPick(position);
    this.end();
    openFile(fileUri(item.file));
  }

  private learnFromPick(position: number): void {
    const { files, context } = this.data;
    const shown = this.ranking.results.slice(0, position + 2).map((result): ShownResult => {
      const file = files[result.fileIndex];
      return { signals: signalValues(file, result.text, context), isCurrentFile: file.key === context.current?.key };
    });
    services.learning.learnFromPick(shown, position);
  }

  private toItem(result: RankedFile, showDetails: boolean): FileQuickPickItem {
    const file = this.data.files[result.fileIndex];
    return {
      label: file.label,
      description: file.directory,
      detail: showDetails ? this.scoreBreakdown(result) : undefined,
      // VS Code draws the active file icon theme's icon from these, also over remote connections.
      resourceUri: fileUri(file),
      iconPath: vscode.ThemeIcon.File,
      file,
    };
  }

  /** e.g. "251.3 = pathMatch 138.2 + nameMatch 99.1 + frecency 14.0" */
  private scoreBreakdown(result: RankedFile): string {
    const { files, context, weights } = this.data;
    const values = signalValues(files[result.fileIndex], result.text, context);
    const parts = SIGNALS.filter((signal) => values[signal] > 0).map(
      (signal) => `${signal} ${(values[signal] * weights[signal]).toFixed(1)}`
    );
    return `${result.score.toFixed(1)} = ${parts.join(" + ") || "0"}`;
  }
}

function createRankingData(editor: vscode.TextEditor): RankingData {
  const files = services.index.current;
  const current = locate(editor.document.uri);
  const history = services.history.scores(current?.key);
  const context: RankingContext = {
    current,
    previousKey: history.previousKey,
    openTabKeys: openTabKeys(),
    changedKeys: changedFileKeys(),
    frecency: history.frecency,
    recency: history.recency,
    relationship: history.relationship,
    coChange: coChangeScores(editor.document.uri, current) ?? new Map(),
  };
  const weights = services.learning.weights;
  const baseScores = new Float64Array(files.length);
  for (let i = 0; i < files.length; i++) {
    baseScores[i] = baseScore(files[i], context, weights);
  }
  return { files, context, weights, baseScores };
}

function openTabKeys(): Set<string> {
  const keys = new Set<string>();
  for (const tab of vscode.window.tabGroups.all.flatMap((group) => group.tabs)) {
    const input = tab.input;
    const uri =
      input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputNotebook
        ? input.uri
        : input instanceof vscode.TabInputTextDiff
          ? input.modified
          : undefined;
    const key = uri && locate(uri)?.key;
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

/** Undefined while disabled, or until git has finished; the open picker re-ranks once it has. */
function coChangeScores(uri: vscode.Uri, current: FileLocation | undefined): ReadonlyMap<string, number> | undefined {
  const folder = current && vscode.workspace.workspaceFolders?.[current.folderIndex];
  if (!folder || !vscode.workspace.getConfiguration("vstoys.smart-open").get("gitCoChange", false)) {
    return undefined;
  }
  return services.coChange.lookup(uri.fsPath, folder.uri.fsPath, () => openPicker?.refresh());
}

async function openFile(uri: vscode.Uri): Promise<void> {
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    // The visit is recorded by the history's active-editor listener.
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open file: ${error}`);
  }
}
