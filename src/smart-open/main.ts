import * as vscode from "vscode";
import { updateCustomLabelConfiguration } from "../helpers/customEditorLabelService";
import { createOutputChannel } from "../extension";
import { CoChangeCache } from "./coChange";
import { showDebugQuickPick } from "./debugQuickPick";
import { FileIndex, locate } from "./fileIndex";
import { AccessHistory } from "./history";
import { LearnedRanking } from "./learning";
import { initializeSmartOpenPicker, showQuickPickWithInlineSearch } from "./picks/fileListWithFuzzy";

/** A file counts as visited once it has stayed active this long, so flipping through tabs does not count. */
const VISIT_DELAY_MS = 400;
/** Lets VS Code finish starting before the first (possibly large) index build. */
const FIRST_INDEX_DELAY_MS = 1000;

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
export let printSmartOpenOutput: (content: string, reveal?: boolean) => void;

export function activateSmartOpen(name: string, context: vscode.ExtensionContext) {
  printSmartOpenOutput = createOutputChannel(name);
  const log = printSmartOpenOutput;

  updateCustomLabelConfiguration();
  const index = new FileIndex(log);
  const history = new AccessHistory(context.workspaceState, log);
  const learning = new LearnedRanking(context.globalState, log);
  const services = { index, history, learning, coChange: new CoChangeCache(log) };

  const firstIndex = setTimeout(() => void index.refreshIfNeeded(), FIRST_INDEX_DELAY_MS);

  context.subscriptions.push(
    index,
    history,
    { dispose: () => clearTimeout(firstIndex) },
    recordVisits(history),
    ...initializeSmartOpenPicker(services),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("workbench.editor.customLabels")) {
        updateCustomLabelConfiguration();
      }
    }),
    // Saving when the window loses focus means a window closed soon after loses no visits.
    vscode.window.onDidChangeWindowState((state) => {
      if (!state.focused) {
        history.flush();
      }
    }),
    vscode.commands.registerCommand("vstoys.smart-open.showQuickPick", showQuickPickWithInlineSearch),
    vscode.commands.registerCommand("vstoys.debug.showQuickPick", () => showDebugQuickPick(services, log))
  );
  log(`${name} activated`);
}

/** Smart Open's disposables are in `context.subscriptions`, which VS Code disposes after deactivation. */
export function deactivateSmartOpen() {}

/** Records the active editor's file once it has stayed active for a moment. */
function recordVisits(history: AccessHistory): vscode.Disposable {
  let pending: ReturnType<typeof setTimeout> | undefined;
  const visitLater = (editor: vscode.TextEditor | undefined) => {
    clearTimeout(pending);
    const location = editor && locate(editor.document.uri);
    if (location) {
      pending = setTimeout(() => {
        if (vscode.window.activeTextEditor?.document.uri.toString() === editor.document.uri.toString()) {
          history.record(location.key);
        }
      }, VISIT_DELAY_MS);
    }
  };
  visitLater(vscode.window.activeTextEditor);
  const listener = vscode.window.onDidChangeActiveTextEditor(visitLater);
  return {
    dispose: () => {
      clearTimeout(pending);
      listener.dispose();
    },
  };
}
