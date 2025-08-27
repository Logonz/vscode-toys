import { commands, Disposable, ExtensionContext, window, workspace } from "vscode";
import { MotionInput, InteractiveMotionInput } from "./motionInput";
import { initializeMotionOperations, updateMotionConfig, executeMotion, MotionConfig } from "./motionOperations";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
export let printMotionOutput: (content: string, reveal?: boolean) => void;

// Track active motion input instances for escape handling
let activeMotionInputs: Set<MotionInput | InteractiveMotionInput> = new Set();

const ConfigSpace = "vstoys.motions";

export function activateMotions(
  name: string,
  context: ExtensionContext,
  createOutputChannel: (name: string) => any
): Disposable[] {
  printMotionOutput = createOutputChannel(name);

  const disposables: Disposable[] = [];
  
  // Initialize configuration
  let config = workspace.getConfiguration(ConfigSpace);
  let motionConfig: MotionConfig = {
    foregroundColor: config.get("foregroundColor"),
    backgroundColor: config.get("backgroundColor") || "editor.wordHighlightBackground",
    timeout: config.get("timeout") || 300,
  };
  
  // Initialize motion operations with config
  initializeMotionOperations(printMotionOutput, motionConfig);

  // Register commands that start input listening
  disposables.push(
    commands.registerCommand("vstoys.motions.start", startMotionInput),
    commands.registerCommand("vstoys.motions.di", () => startMotionInput("di")),
    commands.registerCommand("vstoys.motions.da", () => startMotionInput("da")),
    commands.registerCommand("vstoys.motions.yi", () => startMotionInput("yi")),
    commands.registerCommand("vstoys.motions.ya", () => startMotionInput("ya")),
    commands.registerCommand("vstoys.motions.vi", () => startMotionInput("vi")),
    commands.registerCommand("vstoys.motions.va", () => startMotionInput("va")),
    commands.registerCommand("vstoys.motions.escape", cancelMotionInput),
    workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(`${ConfigSpace}.foregroundColor`) ||
        event.affectsConfiguration(`${ConfigSpace}.backgroundColor`) ||
        event.affectsConfiguration(`${ConfigSpace}.timeout`)
      ) {
        printMotionOutput("Configuration changed");
        config = workspace.getConfiguration(ConfigSpace);
        motionConfig = {
          foregroundColor: config.get("foregroundColor"),
          backgroundColor: config.get("backgroundColor") || "editor.wordHighlightBackground",
          timeout: config.get("timeout") || 300,
        };
        updateMotionConfig(motionConfig);
      }
    })
  );

  printMotionOutput("Motions module activated");
  return disposables;
}

function cancelMotionInput(): void {
  printMotionOutput("Cancelling motion input via escape");

  // Cancel all active motion inputs
  activeMotionInputs.forEach((input) => {
    input.destroy();
  });
  activeMotionInputs.clear();
}

function startMotionInput(operation?: string): void {
  const editor = window.activeTextEditor;
  if (!editor) {
    printMotionOutput("No active text editor");
    return;
  }

  if (operation) {
    // Direct operation like "di", "da", etc.
    const motionInput = new MotionInput({
      textEditor: editor,
      operation: operation,
      onComplete: (op, textObj, count) => {
        activeMotionInputs.delete(motionInput);
        executeMotion(op, textObj, count);
      },
      onCancel: () => {
        activeMotionInputs.delete(motionInput);
        printMotionOutput("Motion input cancelled");
      },
    });
    activeMotionInputs.add(motionInput);
  } else {
    // Interactive mode - build the motion on the fly
    const interactiveInput = new InteractiveMotionInput({
      textEditor: editor,
      onComplete: (op, textObj, count) => {
        activeMotionInputs.delete(interactiveInput);
        executeMotion(op, textObj, count);
      },
      onCancel: () => {
        activeMotionInputs.delete(interactiveInput);
        printMotionOutput("Motion input cancelled");
      },
    });
    activeMotionInputs.add(interactiveInput);
  }
}

