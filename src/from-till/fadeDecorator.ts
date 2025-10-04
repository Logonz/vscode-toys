import * as vscode from "vscode";

const decorationMap = new WeakMap<vscode.TextEditor, vscode.TextEditorDecorationType>();

function getDecoration(editor: vscode.TextEditor): vscode.TextEditorDecorationType {
  let decoration = decorationMap.get(editor);
  if (!decoration) {
    decoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      color: "#FFFFFF55",
    });
    decorationMap.set(editor, decoration);
  }
  return decoration;
}

export function fade(editor: vscode.TextEditor, lines: vscode.Range[]): void {
  if (lines.length === 0) {
    return;
  }

  const decoration = getDecoration(editor);
  editor.setDecorations(decoration, lines);
}

export function unfade(editor: vscode.TextEditor): void {
  const decoration = decorationMap.get(editor);
  if (!decoration) {
    return;
  }
  editor.setDecorations(decoration, []);
}
