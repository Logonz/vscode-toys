import * as vscode from "vscode";

type DecodedToken = {
  line: number;
  startChar: number;
  length: number;
  type: string;
  modifiers: string[];
  text?: string;
};

export async function fetchDocumentSymbols(
  editor: vscode.TextEditor,
  debugMode: boolean = false
): Promise<DecodedToken[]> {
  const symbols: any = await vscode.commands.executeCommand(
    "vscode.executeDocumentSymbolProvider",
    editor.document.uri
  );

  if (!symbols || !Array.isArray(symbols)) {
    return [];
  }

  return convertSymbolsToTokens(symbols, editor.document, editor.visibleRanges, debugMode);
}

function convertSymbolsToTokens(
  symbols: any[],
  document: vscode.TextDocument,
  visibleRanges: readonly vscode.Range[],
  debugMode: boolean = false
): DecodedToken[] {
  const tokens: DecodedToken[] = [];

  // Helper function to recursively process symbols and their children
  const processSymbol = (symbol: any) => {
    if (symbol.location && symbol.location.range) {
      const range = symbol.location.range;
      const position = new vscode.Position(range.start.line, range.start.character);

      // Check if symbol is within visible ranges (unless in debug mode)
      const isVisible = debugMode || visibleRanges.some((visibleRange) => visibleRange.contains(position));

      if (isVisible) {
        // Map VS Code symbol kinds to semantic token types
        const type = mapSymbolKindToTokenType(symbol.kind);

        // Get the actual text at the symbol location
        const symbolRange = new vscode.Range(
          range.start.line,
          range.start.character,
          range.end.line,
          range.end.character
        );
        const text = document.getText(symbolRange) || symbol.name;

        tokens.push({
          line: range.start.line,
          startChar: range.start.character,
          length: text.length,
          type: type,
          modifiers: [], // Document symbols don't have modifiers like semantic tokens
          text: text,
        });
      }
    }

    // Recursively process children if they exist
    if (symbol.children && Array.isArray(symbol.children)) {
      symbol.children.forEach(processSymbol);
    }
  };

  symbols.forEach(processSymbol);
  return tokens;
}

// Map VS Code SymbolKind to semantic token types
const kindMapping: { [key: string]: string } = {
  File: "namespace",
  Module: "namespace",
  Namespace: "namespace",
  Package: "namespace",
  Class: "class",
  Method: "method",
  Property: "property",
  Field: "property",
  Constructor: "method",
  Enum: "enum",
  Interface: "interface",
  Function: "function",
  Variable: "variable",
  Constant: "variable",
  String: "variable",
  Number: "variable",
  Boolean: "variable",
  Array: "variable",
  Object: "variable",
  Key: "property",
  Null: "variable",
  EnumMember: "enumMember",
  Struct: "struct",
  Event: "event",
  Operator: "function",
  TypeParameter: "typeParameter",
};
function mapSymbolKindToTokenType(symbolKind: string): string {
  return kindMapping[symbolKind] || "variable";
}
