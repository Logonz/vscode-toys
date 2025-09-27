import * as vscode from "vscode";
import { createOutputChannel } from "../extension";
import { SemanticJumpHandler } from "./semantic/semanticJumpHandler";
import { RegularJumpHandler } from "./regular/regularJumpHandler";
import { HybridJumpHandler } from "./hybrid/hybridJumpHandler";

let printSemanticJumpOutput: (content: string, reveal?: boolean) => void;
let semanticJumpHandler: SemanticJumpHandler;
let regularJumpHandler: RegularJumpHandler;
let hybridJumpHandler: HybridJumpHandler;

export function activateSemanticJump(name: string, context: vscode.ExtensionContext) {
  console.log(`Activating ${name}`);
  printSemanticJumpOutput = createOutputChannel(`${name}`);
  printSemanticJumpOutput(`${name} activating`);

  vscode.commands.executeCommand("setContext", "vstoys.semantic-jump.active", false);
  vscode.commands.executeCommand("setContext", "vstoys.regular-jump.active", false);
  vscode.commands.executeCommand("setContext", "vstoys.hybrid-jump.active", false);

  semanticJumpHandler = new SemanticJumpHandler();
  regularJumpHandler = new RegularJumpHandler();
  hybridJumpHandler = new HybridJumpHandler();

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
    }),

    // Hybrid jump commands
    vscode.commands.registerCommand("vstoys.hybrid-jump.start", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        printSemanticJumpOutput("No active text editor");
        return;
      }

      await hybridJumpHandler.startHybridJump(editor);
    }),
    vscode.commands.registerCommand("vstoys.hybrid-jump.escape", async () => {
      await hybridJumpHandler.cancelHybridJump();
    }),
    vscode.commands.registerCommand("vstoys.hybrid-jump.backspace", async () => {
      await hybridJumpHandler.backspace();
    }),
    vscode.commands.registerCommand("vstoys.hybrid-jump.enter", async () => {
      await hybridJumpHandler.enter();
    }),
    vscode.commands.registerCommand("vstoys.hybrid-jump.next", async () => {
      await hybridJumpHandler.nextMatch();
    }),
    vscode.commands.registerCommand("vstoys.hybrid-jump.previous", async () => {
      await hybridJumpHandler.previousMatch();
    })
  );

  printSemanticJumpOutput(`${name} activated`, false);
}
