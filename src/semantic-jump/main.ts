import * as vscode from "vscode";
import { createOutputChannel } from "../extension";
import { SemanticJumpHandler } from "./semantic/semanticJumpHandler";
import { RegularJumpHandler } from "./regular/regularJumpHandler";

let printSemanticJumpOutput: (content: string, reveal?: boolean) => void;
let semanticJumpHandler: SemanticJumpHandler;
let regularJumpHandler: RegularJumpHandler;

export function activateSemanticJump(name: string, context: vscode.ExtensionContext) {
  console.log(`Activating ${name}`);
  printSemanticJumpOutput = createOutputChannel(`${name}`);
  printSemanticJumpOutput(`${name} activating`);

  semanticJumpHandler = new SemanticJumpHandler();
  regularJumpHandler = new RegularJumpHandler();

  context.subscriptions.push(
    // Semantic jump commands
    vscode.commands.registerCommand("vstoys.semantic-jump.jump", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        printSemanticJumpOutput("No active text editor");
        return;
      }

      await semanticJumpHandler.startSemanticJump(editor, false);
    }),
    vscode.commands.registerCommand("vstoys.semantic-jump.debug", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        printSemanticJumpOutput("No active text editor");
        return;
      }

      await semanticJumpHandler.startSemanticJump(editor, true);
    }),
    vscode.commands.registerCommand("vstoys.semantic-jump.escape", () => {
      semanticJumpHandler.forceCleanup();
    }),

    // Regular jump commands - handled by package configuration, just set up handlers
    vscode.commands.registerCommand("vstoys.regular-jump.start", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        printSemanticJumpOutput("No active text editor");
        return;
      }

      await regularJumpHandler.startRegularJump(editor);
    }),
    vscode.commands.registerCommand("vstoys.regular-jump.escape", async () => {
      await regularJumpHandler.cancelRegularJump();
    }),
    vscode.commands.registerCommand("vstoys.regular-jump.backspace", async () => {
      await regularJumpHandler.backspace();
    }),
    vscode.commands.registerCommand("vstoys.regular-jump.enter", async () => {
      await regularJumpHandler.enter();
    }),
    vscode.commands.registerCommand("vstoys.regular-jump.next", async () => {
      await regularJumpHandler.nextMatch();
    }),
    vscode.commands.registerCommand("vstoys.regular-jump.previous", async () => {
      await regularJumpHandler.previousMatch();
    })
  );

  printSemanticJumpOutput(`${name} activated`, false);
}
