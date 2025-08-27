import { window, Selection, Range, env, ThemeColor } from "vscode";
import { findTextObject, TEXT_OBJECTS } from "./textObjects";

export interface MotionConfig {
  foregroundColor?: string;
  backgroundColor: string;
  timeout: number;
}

let printMotionOutput: (content: string, reveal?: boolean) => void;
let motionConfig: MotionConfig;

export function initializeMotionOperations(
  outputFunction: (content: string, reveal?: boolean) => void,
  config: MotionConfig
): void {
  printMotionOutput = outputFunction;
  motionConfig = config;
}

export function updateMotionConfig(config: MotionConfig): void {
  motionConfig = config;
}

export function executeMotion(operation: string, textObject: string, count: number): void {
  const editor = window.activeTextEditor;
  if (!editor) {
    printMotionOutput("No active text editor for motion execution");
    return;
  }

  if (!TEXT_OBJECTS[textObject]) {
    printMotionOutput(`Invalid text object: ${textObject}`);
    return;
  }

  const selections: Selection[] = [];
  const rangesToProcess: { range: Range; isInner: boolean }[] = [];

  for (const selection of editor.selections) {
    const position = selection.active;
    const textObjectRange = findTextObject(editor.document, position, textObject, count);

    if (!textObjectRange) {
      printMotionOutput(
        `No text object found for ${count}${operation}${textObject} at position ${position.line}:${position.character}`
      );
      continue;
    }

    const isInner = operation.includes("i");
    const range = isInner ? textObjectRange.inner : textObjectRange.outer;

    rangesToProcess.push({ range, isInner });
    selections.push(new Selection(range.start, range.end));
  }

  if (rangesToProcess.length === 0) {
    printMotionOutput("No valid text objects found");
    return;
  }

  const operationType = operation.charAt(0);

  switch (operationType) {
    case "d":
      performDelete(editor, rangesToProcess);
      break;
    case "y":
      performYank(editor, rangesToProcess);
      break;
    case "v":
    case "s":
      performSelect(editor, selections);
      break;
    default:
      printMotionOutput(`Unknown operation: ${operationType}`);
  }
}

async function performDelete(editor: any, ranges: { range: Range; isInner: boolean }[]): Promise<void> {
  await editor.edit((editBuilder: any) => {
    ranges.sort((a, b) => b.range.start.compareTo(a.range.start));

    for (const { range } of ranges) {
      editBuilder.delete(range);
    }
  });
  printMotionOutput(`Deleted ${ranges.length} text object(s)`);
}


async function performYank(editor: any, ranges: { range: Range; isInner: boolean }[]): Promise<void> {
  const texts = ranges.map(({ range }) => editor.document.getText(range));
  const combinedText = texts.join("\n");

  await env.clipboard.writeText(combinedText);

  // Highlight the yanked ranges for visual feedback
  const decorationType = window.createTextEditorDecorationType({
    backgroundColor: motionConfig.backgroundColor
      ? pickColorType(motionConfig.backgroundColor)
      : pickColorType("editor.wordHighlightBackground"),
    color: motionConfig.foregroundColor || undefined,
  });

  // Apply decoration to all yanked ranges
  const decorationRanges = ranges.map(({ range }) => range);
  editor.setDecorations(decorationType, decorationRanges);

  // Remove decoration after timeout
  setTimeout(() => {
    decorationType.dispose();
  }, motionConfig.timeout);

  printMotionOutput(`Yanked ${ranges.length} text object(s) to clipboard`);
}

function performSelect(editor: any, selections: Selection[]): void {
  editor.selections = selections;
  printMotionOutput(`Selected ${selections.length} text object(s)`);
}


/**
 * @param inputColor Takes a theme ID (like `editor.background`) or color string (like `#ffffff`) and returns vscode.ThemeColor or unchanged color string
 */
function pickColorType(inputColor: string): ThemeColor | string {
  if (/[a-z]+\.[a-z]+/i.test(inputColor)) {
    return new ThemeColor(inputColor);
  } else {
    return inputColor;
  }
}