# Paste-Replace Module - Context & Implementation

## User Requirements & Intent

The user wanted to create a **NeoVim-inspired paste-replace functionality** that provides intelligent line replacement with preserved indentation:

### Core Functionality
- **Smart line replacement**: Replace current line content while preserving indentation structure
- **Multi-line support**: Handle multi-line clipboard content with relative indentation preservation  
- **Keybinding**: `Ctrl+Shift+V` (Windows/Linux) / `Cmd+Shift+V` (Mac) for quick access
- **Indentation anchoring**: "Anchor" clipboard content to target line's indentation level

### User Experience Goals
- **NeoVim familiarity**: Similar to vim's paste-replace behavior but adapted for VSCode
- **Intelligent indentation**: Preserve relative indentation structure of pasted content
- **Cross-platform compatibility**: Handle different line ending formats seamlessly
- **One-step operation**: Single keypress to replace line with clipboard content

## Implementation Evolution

### Initial Requirements
User started with a simple request: *"paste and replace line while keeping things like whitespace the same by potentially trimming whitespace to the left and pasting it in with the exact same indentation"*

### Enhanced Requirements  
User then requested multi-line support with an example:
```typescript
  let singlePressCommand: string = vscode.workspace
    .getConfiguration("smart-open")
    .get("singlePressCommand") as string;
```

**Goal**: When pasting this at a differently indented line, preserve the relative indentation structure while anchoring to the target line's base indentation.

## Technical Implementation

### Core Algorithm: Relative Indentation Preservation

#### Phase 1: Analyze Source Content
```typescript
// Find minimum indentation level (base anchor point)
let minIndentation = Infinity;
for (const line of clipboardLines) {
  if (line.trim().length > 0) {
    minIndentation = Math.min(minIndentation, line.match(/^(\s*)/)[1].length);
  }
}
```

#### Phase 2: Calculate Relative Indentation
```typescript
// For each line, determine extra indentation beyond base level
const relativeIndent = lineIndent.substring(minIndentation);
const content = line.substring(lineIndent.length);
```

#### Phase 3: Apply Target Indentation
```typescript
// Combine target + relative + content
const newLine = targetIndentation + relativeIndent + content;
```

### Key Functions

#### `detectLineEnding(document)` 
- **Purpose**: Cross-platform line ending detection
- **Returns**: `'\r\n'` for Windows (CRLF) or `'\n'` for Unix/Mac (LF)
- **Uses**: VSCode's built-in `document.eol` property

#### `processMultiLineContent(clipboardLines, targetIndentation)`
- **Purpose**: Core indentation processing algorithm
- **Input**: Array of clipboard lines and target indentation string
- **Output**: Array of processed lines with adjusted indentation
- **Features**:
  - Trailing empty line cleanup
  - Minimum indentation detection
  - Relative indentation calculation
  - Empty line preservation

### Line Insertion Logic

#### Single Line Mode
```typescript
if (processedLines.length === 1) {
  editBuilder.replace(fullLineRange, processedLines[0]);
}
```

#### Multi-Line Mode
```typescript
// Replace current line with first processed line
editBuilder.replace(fullLineRange, processedLines[0]);

// Insert additional lines after current line
const additionalLines = lineEnding + processedLines.slice(1).join(lineEnding);
editBuilder.insert(endOfCurrentLine, additionalLines);
```

## Current Commands & Usage

### Command
- **`vstoys.paste-replace.replaceLineWithClipboard`**: Replace current line with clipboard content using smart indentation

### Keybinding
- **Windows/Linux**: `Ctrl+Shift+V`
- **Mac**: `Cmd+Shift+V`
- **Context**: Active when editor has focus and module is enabled

### Configuration
- **`vstoys.paste-replace.enabled`** (boolean, default: true): Enable/disable the module

## Usage Examples

### Single Line Example
**Target line:** `    console.log('old');` (4 spaces)  
**Clipboard:** `alert('new')`  
**Result:** `    alert('new')` (preserves 4 spaces)

### Multi-Line Example  
**Target line:** `    // comment` (4 spaces)  
**Clipboard:**
```typescript
  let config = workspace
    .getConfiguration()
    .get("value");
```
**Result:**
```typescript
    let config = workspace
      .getConfiguration()
      .get("value");
```

## Development Insights & Lessons

### Line Ending Complexity
- **Challenge**: Supporting both CRLF and LF line endings
- **Solution**: Use `document.eol` for detection and `/\r?\n/` for parsing
- **Learning**: VSCode's `endOfCurrentLine` points to end of content, not after line terminator

### Indentation Algorithm Evolution
- **Initial**: Simple single-line replacement with preserved indentation
- **Enhanced**: Complex multi-line algorithm with relative indentation anchoring
- **Key insight**: "Anchoring" concept - adjust all content relative to minimum indentation level

### Error Handling & Edge Cases
- **Empty clipboard**: Graceful message display
- **No active editor**: Clear error messaging  
- **Empty lines**: Preserved in relative structure
- **Trailing whitespace**: Automatically cleaned up

## Integration with VSCode Toys

### Architecture Compliance
- **Activation pattern**: `activatePasteReplace(name, context)` following module conventions
- **Output channel**: Dedicated logging with `createOutputChannel`  
- **Package injection**: Uses `.paste-replace-package.jsonc` for configuration
- **Context management**: Sets `vstoys.paste-replace.active` for conditional keybindings

### Error Handling Philosophy
- **User-friendly messages**: Clear error states via `vscode.window.showErrorMessage`
- **Debug logging**: Detailed logging to output channel for troubleshooting
- **Graceful degradation**: Handles edge cases without crashing

## Future Enhancement Opportunities

### Advanced Features
- **Configuration options**: Customizable keybinding, indentation behavior settings
- **Language awareness**: Different behavior for different file types  
- **Selection support**: Paste-replace selected text instead of entire line
- **Integration**: Connect with registers module for advanced clipboard management

### Performance Considerations
- **Large clipboard**: Algorithm handles large multi-line content efficiently
- **Real-time processing**: Fast indentation calculation with O(n) complexity
- **Memory usage**: Minimal overhead with efficient string processing

## Design Philosophy

The module embodies **intelligent automation** principles:
- **Predictable behavior**: Consistent indentation handling across all scenarios
- **Minimal user input**: Single keypress for complex indentation operations
- **Cross-platform consistency**: Works identically across Windows/Mac/Linux
- **NeoVim inspiration**: Brings power-user efficiency to VSCode environment
- **VSCode integration**: Leverages native APIs and follows extension best practices

This implementation successfully bridges NeoVim's paste-replace efficiency with VSCode's modern editor capabilities while maintaining the simplicity and predictability that users expect.