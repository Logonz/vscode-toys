import * as vscode from "vscode";

type DecodedToken = {
  line: number;
  startChar: number;
  length: number;
  type: string;
  modifiers: string[];
  text?: string;
};

export async function fetchSemanticTokens(
  editor: vscode.TextEditor,
  debugMode: boolean = false
): Promise<DecodedToken[]> {
  const visibleRanges = editor.visibleRanges;
  if (visibleRanges.length === 0) {
    return [];
  }

  const visibleRange = visibleRanges[0];

  const legend: any = await vscode.commands.executeCommand(
    "vscode.provideDocumentRangeSemanticTokensLegend",
    editor.document.uri,
    visibleRange
  );

  if (!legend) {
    return [];
  }

  const tokens: any = await vscode.commands.executeCommand(
    "vscode.provideDocumentRangeSemanticTokens",
    editor.document.uri,
    visibleRange
  );

  if (!tokens || !tokens.data) {
    return [];
  }

  return decodeSemanticTokens(tokens.data, legend, editor.document, debugMode);
}

function decodeSemanticTokens(
  data: Uint32Array,
  legend: { tokenTypes: string[]; tokenModifiers: string[] },
  document: vscode.TextDocument,
  debugMode: boolean = false
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

    const text = document.getText(new vscode.Range(line, char, line, char + length));

    out.push({ line, startChar: char, length, type, modifiers, text });
  }

  return out;
}

export function filterTokens(tokens: DecodedToken[], debugMode: boolean = false): DecodedToken[] {
  const config = vscode.workspace.getConfiguration("vstoys.semantic-jump");

  // Debug mode shows ALL tokens
  if (debugMode) {
    return tokens.filter((token) => token.text && token.text.trim().length > 0);
  }

  // Check if "all" mode is enabled
  const includeAllTypes = config.get<boolean>("includeAllTokenTypes", false);
  if (includeAllTypes) {
    return tokens.filter((token) => token.text && token.text.trim().length > 0);
  }

  // Normal filtering by included types
  const includedTypes = config.get<string[]>("includedTokenTypes", [
    "function",
    "method",
    "class",
    "interface",
    "type",
    "enum",
    "enumMember",
    "variable",
    "property",
    "parameter",
    "namespace",
    "typeParameter",
    "struct",
    "decorator",
    "event",
    "macro",
    "label",
  ]);

  return tokens.filter((token) => includedTypes.includes(token.type) && token.text && token.text.trim().length > 0);
}
