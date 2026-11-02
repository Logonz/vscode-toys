import * as vscode from "vscode";
import { createOutputChannel } from "../extension";
import { GitFileDecorator, SETTINGS_SECTION } from "./decorator";
import type { GitExtension } from "./git";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
export let printGitFileDecoratorOutput: (content: string, reveal?: boolean) => void;

/**
 * Runs the decorator while both the built-in Git extension and `vstoys.git.fileDecorator.enabled` are on,
 * starting and stopping it as either changes.
 */
export function activateFileDecorator(name: string, context: vscode.ExtensionContext) {
  console.log(`${name} extension activated.`);
  printGitFileDecoratorOutput = createOutputChannel("Git File Decorator");

  let decorator: GitFileDecorator | undefined;
  context.subscriptions.push(
    { dispose: () => decorator?.dispose() },
    vscode.commands.registerCommand("vstoys.git.fileDecorator.refresh", async () => {
      if (decorator) {
        await decorator.refreshAll();
      } else {
        printGitFileDecoratorOutput("Not running: it is disabled in settings, or the built-in Git extension is.", true);
      }
    })
  );

  const gitExtension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!gitExtension) {
    printGitFileDecoratorOutput("The built-in Git extension is missing, so file decorations are off.");
    return;
  }

  gitExtension.activate().then(
    (git) => {
      const startOrStop = () => {
        const shouldRun = git.enabled && vscode.workspace.getConfiguration(SETTINGS_SECTION).get("enabled", true);
        if (shouldRun && !decorator) {
          decorator = new GitFileDecorator(git.getAPI(1), printGitFileDecoratorOutput);
        } else if (!shouldRun && decorator) {
          decorator.dispose();
          decorator = undefined;
        }
      };
      context.subscriptions.push(
        // The Git extension fires this before its API is ready (getAPI still throws), so react a microtask later.
        git.onDidChangeEnablement(() => queueMicrotask(startOrStop)),
        vscode.workspace.onDidChangeConfiguration((event) => {
          if (event.affectsConfiguration(`${SETTINGS_SECTION}.enabled`)) {
            startOrStop();
          }
        })
      );
      startOrStop();
    },
    (error) => printGitFileDecoratorOutput(`Could not activate the built-in Git extension: ${error}`)
  );
}
