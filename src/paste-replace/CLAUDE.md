# Paste-Replace Module - Complete Implementation Guide

## Overview

The Paste-Replace module provides **intelligent paste functionality** that goes beyond VSCode's default paste behavior. It offers two distinct commands with different levels of intelligence and predictability, designed to handle both simple line replacement and complex multi-line pasting with smart indentation.

## Core Commands

### 1. `clipboardPasteReplace` (Ctrl+Shift+V / Cmd+Shift+V)

**Philosophy**: Predictable, simple replacement behavior

- **With selections**: Always replaces entire lines, regardless of selection type
- **Empty lines**: Uses existing indentation (even if empty/none)
- **Non-empty lines**: Matches the exact indentation of the line being replaced
- **Behavior**: "What you see is what you get" - no smart detection

### 2. `clipboardPasteSmart` (Ctrl+V / Cmd+V)

**Philosophy**: Intelligent, context-aware pasting

- **Partial selections**: Uses VSCode's default paste (preserves selection boundaries)
- **Full-line selections**: Uses custom replacement with smart indentation detection
- **Empty lines**: Analyzes surrounding context to determine proper indentation
- **Multi-line selections**: Smart detection of whether to use custom or default behavior

## Selection Intelligence Logic

### Smart Paste Selection Detection

The `clipboardPasteSmart` command uses sophisticated logic to determine when to apply custom behavior:

#### Single-Line Selections

```typescript
// Custom replacement ONLY if:
const linePrefix = line.text.substring(0, selection.start.character);
const lineSuffix = line.text.substring(selection.end.character);
const isFullLine = linePrefix.trim() === "" && lineSuffix.trim() === "";
```

- **Full-line selection**: `    |"role": "Cosmic App",   |` → Custom replacement
- **Partial selection**: `"rol|e": "Cosmic A|pp"` → Standard paste

#### Multi-Line Selections

```typescript
// Custom replacement ONLY if:
const startsAtLineBeginning = startLinePrefix.trim() === "";
const endsAtLineEnd = selection.end.character >= endLine.text.length || selection.end.character === 0;
const isFullLineSelection = startsAtLineBeginning && endsAtLineEnd;
```

- **Full multi-line**: `|    "role": "App",\n    "tenant": "PROD"|` → Custom replacement
- **Partial multi-line**: `"Cosm|ic App",\n...\n"vcpus": 6,|` → Standard paste

## Smart Indentation Detection

### Algorithm Overview

The smart indentation system uses VSCode's formatting engine to determine proper indentation:

```typescript
async function detectSmartIndentation(editor, position) {
  // 1. Try VSCode's formatting engine
  const edits = await vscode.commands.executeCommand(
    "vscode.executeFormatRangeProvider",
    document.uri,
    formatRange,
    options
  );

  // 2. Fallback to context analysis
  const shouldIncreaseIndent = /[{\[\(:]$/.test(trimmedText);

  // 3. Final fallback to existing indentation
  return existingIndentation;
}
```

### Context Analysis

1. **Find nearest non-empty line above** the cursor position
2. **Use VSCode's format provider** to determine proper indentation
3. **Analyze syntax patterns** (lines ending with `{`, `[`, `(`, `:` typically increase indent)
4. **Fallback to existing indentation** if all else fails

## Multi-Line Content Processing

### Relative Indentation Preservation Algorithm

```typescript
function processMultiLineContent(clipboardLines, targetIndentation) {
  // 1. Find minimum indentation (anchor point)
  let minIndentation = Infinity;
  for (const line of clipboardLines) {
    if (line.trim().length > 0) {
      minIndentation = Math.min(minIndentation, getIndentLength(line));
    }
  }

  // 2. Process each line
  for (const line of clipboardLines) {
    const relativeIndent = line.substring(minIndentation);
    const content = line.substring(originalIndentLength);
    const newLine = targetIndentation + relativeIndent + content;
  }
}
```

### Example: Multi-Line Indentation

**Clipboard content:**

```typescript
let config = workspace.getConfiguration().get("value");
```

**Target line:** `    // comment` (4 spaces indentation)

**Result:**

```typescript
let config = workspace.getConfiguration().get("value");
```

**Explanation**:

- Minimum indentation: 2 spaces
- Relative indentations: 0, 2, 2 spaces
- Applied with 4-space target: 4, 6, 6 spaces

## Configuration Options

### `vstoys.paste-replace.enabled` (boolean, default: true)

Enable/disable the entire Paste-Replace module.

### `vstoys.paste-replace.reindentBeforePaste` (boolean, default: true)

Controls whether to run `editor.action.reindentselectedlines` before pasting when using smart paste with selections.

**Applies to**: `clipboardPasteSmart` with text selections that trigger custom replacement logic.

**Behavior**:

- `true`: After deleting selection, reindent the now-empty lines before applying smart indentation
- `false`: Skip the reindent step, rely purely on smart indentation detection

## Keybinding System

### Default Keybindings

```jsonc
{
  "command": "vstoys.paste-replace.clipboardPasteReplace",
  "key": "ctrl+shift+v", "mac": "cmd+shift+v"
},
{
  "command": "vstoys.paste-replace.clipboardPasteSmart",
  "key": "ctrl+v", "mac": "cmd+v"
},
{
  "command": "editor.action.clipboardPasteAction",
  "key": "ctrl+k ctrl+v", "mac": "ctrl+k cmd+v"
}
```

### Fallback Access

The original VSCode paste is available via `Ctrl+K Ctrl+V` / `Ctrl+K Cmd+V` when the module is active.

## Implementation Architecture

### Function Hierarchy

```
smartPaste(useSmartSelectionLogic: boolean)
├── Selection analysis and routing
├── Custom replacement logic
└── replaceLineWithClipboard(useSmartIndentation: boolean)
    ├── detectSmartIndentation() [if useSmartIndentation=true]
    ├── processMultiLineContent()
    └── VSCode edit operations

detectSmartIndentation()
├── vscode.executeFormatRangeProvider (primary)
├── Context-based heuristics (fallback)
└── Existing indentation (final fallback)
```

### Error Handling Strategy

- **Graceful degradation**: Always falls back to simpler methods if advanced features fail
- **User feedback**: Clear error messages via `vscode.window.showErrorMessage`
- **Debug logging**: Detailed logging to output channel for troubleshooting
- **No data loss**: Failed operations never corrupt existing content

## Edge Cases & Nuances

### Empty Line Handling

- **Empty clipboard**: Shows user-friendly message, no operation performed
- **Lines with only whitespace**: Treated as candidates for smart indentation
- **Trailing empty lines**: Automatically cleaned from clipboard content

### Line Ending Compatibility

```typescript
function detectLineEnding(document) {
  return document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
}
```

Automatically handles Windows (CRLF) vs Unix/Mac (LF) line endings.

### Multiple Cursor Support

- **Independent processing**: Each cursor/selection processed with its own context
- **Reverse order processing**: Prevents line number shifts from affecting subsequent operations
- **Duplicate line handling**: Multiple cursors on same line processed only once

### Selection Boundary Precision

The system differentiates between:

- **Exact character positions**: Mid-word selections use standard paste
- **Whitespace boundaries**: Only selections that respect word/line boundaries use custom logic
- **Line boundary detection**: Precise detection of line-start and line-end positions

## Performance Considerations

### Optimization Strategies

- **Pre-calculation**: Smart indentation calculated before edit operations
- **Single edit transaction**: All changes applied in one `editor.edit()` call
- **Efficient string operations**: Minimal string copying and regex usage
- **Lazy evaluation**: Smart indentation only calculated when needed

### Memory Efficiency

- **Stream processing**: Large clipboard content processed line-by-line
- **Minimal overhead**: No unnecessary string duplication
- **Garbage collection friendly**: Temporary variables properly scoped

## Use Cases & Examples

### 1. Simple Line Replacement

**Scenario**: Replace a variable assignment

```typescript
// Before
let oldVar = "old value";

// Clipboard: `let newVar = "new value";`
// After (PasteReplace):
let newVar = "new value";
```

### 2. Smart Context Indentation

**Scenario**: Paste into empty line inside function

```typescript
function example() {
    if (condition) {
|       // Cursor here on empty line
    }
}

// Clipboard: `console.log("debug");`
// After (PasteSmart):
function example() {
    if (condition) {
        console.log("debug");  // Smart indentation applied
    }
}
```

### 3. Partial Selection Handling

**Scenario**: Replace only part of a line

```typescript
// Before
const message = "Hello World";

// Select "World", clipboard: "Universe"
// After (PasteSmart):
const message = "Hello Universe"; // Only selected part replaced
```

### 4. Complex Multi-Line with Relative Indentation

**Scenario**: Paste code block with nested structure

```typescript
// Target location (4 spaces indented)
    if (condition) {
|       // Paste here
    }

// Clipboard:
```

try {
const result = await api.call();
return result.data;
} catch (error) {
console.error(error);
}

````

// Result:
```typescript
    if (condition) {
        try {
          const result = await api.call();
          return result.data;
        } catch (error) {
          console.error(error);
        }
    }
````

## Design Philosophy

### Core Principles

1. **Predictability**: Consistent behavior across all scenarios
2. **Intelligence**: Smart defaults that "do the right thing"
3. **User Choice**: Two commands for different use cases
4. **No Surprises**: Clear logic about when custom behavior applies
5. **Fallback Safety**: Always degrades gracefully to simpler behavior

### NeoVim Inspiration

- **Efficiency**: Single keypress for complex operations
- **Power User Focus**: Advanced functionality for experienced developers
- **Modal Thinking**: Different behaviors for different contexts
- **Precision**: Exact control over text manipulation

### VSCode Integration

- **Native API Usage**: Leverages VSCode's formatting and editing capabilities
- **Extension Ecosystem**: Follows VSCode extension best practices
- **Configuration System**: Uses VSCode's settings for user customization
- **Keybinding System**: Integrates seamlessly with VSCode's keybinding system

## Future Enhancement Opportunities

### Advanced Features

- **Language-specific behavior**: Different indentation rules per language
- **Custom indentation patterns**: User-definable indentation logic
- **Visual feedback**: Preview of paste operation before execution
- **Clipboard history integration**: Multiple clipboard slots

### Performance Improvements

- **Incremental processing**: Process only changed portions for large files
- **Background calculation**: Pre-calculate indentation for common positions
- **Caching system**: Cache indentation patterns for repeated operations

### User Experience

- **Visual indicators**: Show when custom logic will be applied
- **Tutorial system**: Help users understand when each command should be used
- **Debugging tools**: Better visibility into indentation decisions

This implementation successfully provides a sophisticated yet predictable paste system that enhances VSCode's built-in capabilities while maintaining the simplicity and efficiency that power users expect.
