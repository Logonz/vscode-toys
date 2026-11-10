import * as vscode from "vscode";
import type { PickerServices } from "./picks/fileListWithFuzzy";
import { DEFAULT_WEIGHTS, SIGNALS } from "./ranking";

interface DebugAction extends vscode.QuickPickItem {
  run(): void | Promise<void>;
}

export async function showDebugQuickPick(services: PickerServices, log: (content: string, reveal?: boolean) => void) {
  const { index, history, learning } = services;
  const actions: DebugAction[] = [
    {
      label: "$(graph) Show Ranking Stats",
      description: "Learned weights, pick positions and index size, in the output channel",
      run: () => {
        const average = learning.averagePickPosition;
        const ageSeconds = index.ageMs === undefined ? "never built" : `${Math.round(index.ageMs / 1000)}s old`;
        const weights = SIGNALS.map((signal) => {
          const learned = learning.weights[signal];
          const change = learned - DEFAULT_WEIGHTS[signal];
          return `  ${signal.padEnd(20)} ${learned.toFixed(2).padStart(7)}  (${change >= 0 ? "+" : ""}${change.toFixed(2)})`;
        });
        log(
          [
            "Smart Open ranking stats",
            `  Average position of the last ${learning.pickCount} picks: ${average === undefined ? "no picks yet" : average.toFixed(2)} (0 = always the top result)`,
            `  Files indexed: ${index.current.length} (${ageSeconds})`,
            `  Visits in this workspace's history: ${history.visitCount}`,
            "  Weights (change from default):",
            ...weights,
          ].join("\n"),
          true
        );
      },
    },
    {
      label: "$(refresh) Rebuild File Index",
      description: "List the workspace files again now",
      run: async () => {
        index.markStale();
        await index.refreshIfNeeded();
        log(`File index rebuilt: ${index.current.length} files`, true);
      },
    },
    {
      label: "$(discard) Reset Learned Ranking",
      description: "Forget the weights learned from your picks",
      run: async () => {
        const answer = await vscode.window.showWarningMessage(
          "Reset Smart Open's learned ranking weights to their defaults?",
          { modal: true },
          "Reset"
        );
        if (answer === "Reset") {
          learning.reset();
          log("Learned ranking weights reset to their defaults.", true);
        }
      },
    },
    {
      label: "$(debug-console) Toggle Developer Tools",
      run: () => {
        vscode.commands.executeCommand("workbench.action.toggleDevTools");
      },
    },
  ];

  const action = await vscode.window.showQuickPick(actions, { placeHolder: "Select debug action" });
  await action?.run();
}
