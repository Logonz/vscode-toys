// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { createOutputChannel } from "../extension";
import { openFile } from "./openFile";

/**
 * Prints the given content on the output channel.
 *
 * @param content The content to be printed.
 * @param reveal Whether the output channel should be revealed.
 */
let printAlwaysActiveOutput: (content: string, reveal?: boolean) => void;

type DecodedToken = {
  line: number;
  startChar: number;
  length: number;
  type: string;
  modifiers: string[];
  text?: string;
};

function decodeSemanticTokens(
  data: Uint32Array,
  legend: { tokenTypes: string[]; tokenModifiers: string[] }
): DecodedToken[] {
  const out: DecodedToken[] = [];
  let line = 0;
  let char = 0;

  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaStart = data[i + 1];
    const length = data[i + 2];
    const tokenTypeIndex = data[i + 3];
    const tokenMods = data[i + 4];

    line += deltaLine;
    char = deltaLine === 0 ? char + deltaStart : deltaStart;

    const type = legend.tokenTypes[tokenTypeIndex] ?? "unknown";
    const modifiers: string[] = [];
    for (let bit = 0; bit < 32; bit++) {
      if (tokenMods & (1 << bit)) {
        const mod = legend.tokenModifiers[bit];
        if (mod) modifiers.push(mod);
      }
    }

    out.push({ line, startChar: char, length, type, modifiers });
  }
  return out;
}

function AddTextToDecodedToken(doc: vscode.TextDocument, decodedTokens: DecodedToken[]): DecodedToken[] {
  for (const token of decodedTokens) {
    token.text = doc.getText(new vscode.Range(token.line, token.startChar, token.line, token.startChar + token.length));
  }
  return decodedTokens;
}

// async function openPeek(locations: vscode.Location[]) {
//   const editor = vscode.window.activeTextEditor!;
//   const pos = editor.selection.active;
//   await vscode.commands.executeCommand(
//     "editor.action.peekLocations",
//     editor.document.uri,
//     pos,
//     locations,
//     "goto"
//     // "peek" // or 'goto' | 'gotoAndPeek'
//   );
// }

export function activateAlwaysActive(name: string, context: vscode.ExtensionContext) {
  console.log(`Activating ${name}`);
  printAlwaysActiveOutput = createOutputChannel(`${name}`);
  printAlwaysActiveOutput(`${name} activating`);

  async function g() {
    if (vscode.window.activeTextEditor) {
      // Fetch raw document symbols
      const result: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
        "vscode.executeDocumentSymbolProvider",
        vscode.window.activeTextEditor.document.uri
      );
      console.log("Raw document symbols:", result);

      const processedResult: any = [];

      for (const symbol of result) {
        const text = vscode.window.activeTextEditor.document.getText(symbol.range);
        processedResult.push({ ...symbol, text });
      }
      console.log("Document symbols with text:", processedResult);

      const selectedRange = vscode.window.activeTextEditor.selection;
      const legend: vscode.SemanticTokensLegend = await vscode.commands.executeCommand(
        "vscode.provideDocumentRangeSemanticTokensLegend",
        // "vscode.provideDocumentSemanticTokensLegend",
        // "vscode.executeDocumentHighlights",
        vscode.window.activeTextEditor.document.uri,
        selectedRange
        // vscode.window.activeTextEditor.selection.active
      );
      console.log(legend);

      const tokens: vscode.SemanticTokens = await vscode.commands.executeCommand(
        "vscode.provideDocumentRangeSemanticTokens",
        // "vscode.provideDocumentSemanticTokens",
        // "vscode.executeDocumentHighlights",
        vscode.window.activeTextEditor.document.uri,
        selectedRange
        // vscode.window.activeTextEditor.selection.active
      );
      console.log(tokens);

      if (tokens && tokens.data && tokens.data.length > 0) {
        const decodedTokens = decodeSemanticTokens(tokens.data, legend);
        // console.log(decodedTokens);
        const allTokenText = AddTextToDecodedToken(vscode.window.activeTextEditor.document, decodedTokens);
        console.log(allTokenText);
      }

      // openPeek([
      //   new vscode.Location(vscode.window.activeTextEditor.document.uri, selectedRange),
      //   new vscode.Location(vscode.window.activeTextEditor.document.uri, selectedRange),
      // ]);
    }
  }

  context.subscriptions.push(vscode.commands.registerCommand("vstoys.openFile", openFile));
  context.subscriptions.push(vscode.commands.registerCommand("vstoys.test", g));

  printAlwaysActiveOutput(`${name} activated`, false);
}
