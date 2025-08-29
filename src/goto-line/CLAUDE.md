# Goto Line Module - Enhanced Navigation System

## Overview

The Goto Line module provides **advanced line navigation capabilities** that extend VS Code's built-in "Go to Line" functionality with intelligent previewing, relative navigation, and powerful line operations. It combines absolute and relative line navigation with real-time visual feedback and integrated copy/cut/delete operations.

## Core Features

### Enhanced Navigation Types

- **Absolute Line Navigation**: Jump to specific line numbers with validation and preview
- **Relative Line Navigation**: Move up/down by offset with configurable direction characters
- **Visual Preview System**: Real-time highlighting of target lines and selections during input
- **Integrated Operations**: Copy, cut, delete, and select operations combined with navigation
- **Smart Line Selection**: Intelligent multi-line selection with directional awareness

### User Experience Improvements

- **Live Preview**: See exactly what will happen before executing the command
- **Input Validation**: Real-time feedback with bounds checking and error messages
- **Relative Line Numbers**: Temporarily enables relative line numbers during relative navigation
- **Configurable Highlighting**: Customizable colors for different operation types
- **Smart Error Handling**: Clear feedback for invalid inputs and out-of-bounds operations

## Core Commands

### 1. `vstoys.goto-line.goto` - Absolute Line Navigation

**Purpose**: Navigate to a specific line number with optional operations

**Features**:

- Input validation with real-time preview
- Shows current line and total lines in placeholder
- Bounds checking (1 to document.lineCount)
- Visual preview of target line during typing
- Support for copy/cut/delete/select operations

**Usage Examples**:

- `42` → Jump to line 42
- `1` → Jump to first line
- With args: `{select: true}` → Select from current to target line
- With args: `{copy: true, delete: true}` → Cut target line

### 2. `vstoys.goto-line.goto-relative` - Relative Line Navigation

**Purpose**: Navigate relative to current position with vim-like direction support

**Features**:

- Configurable up/down characters (default: k/j)
- Supports multiple input formats: `+5`, `-3`, `k5`, `j10`, `5`
- Temporarily enables relative line numbers for context
- Real-time preview of relative movement
- Automatic restoration of original line number settings

**Supported Input Formats**:

- `+5` → Move down 5 lines
- `-3` → Move up 3 lines
- `k5` → Move up 5 lines (vim-style)
- `j10` → Move down 10 lines (vim-style)
- `5` → Move down 5 lines (default direction)

## Advanced Operations System

### Operation Types

#### 1. **Copy Operations** (`args.copy = true`)

- **Single Line**: Copies entire target line using VS Code's copy behavior
- **Multi-Line Selection**: Copies selected range from cursor to target
- **Visual Feedback**: Uses `copyColor` highlighting during preview
- **Clipboard Integration**: Content available for standard paste operations

#### 2. **Delete Operations** (`args.delete = true`)

- **Single Line**: Deletes entire target line with line break
- **Multi-Line Selection**: Deletes selected range
- **Auto-Reindent**: Automatically reindents surrounding code after deletion
- **Visual Feedback**: Uses `deleteColor` highlighting during preview

#### 3. **Cut Operations** (`args.copy = true` + `args.delete = true`)

- **Combined Behavior**: Copy + Delete in single operation
- **Visual Feedback**: Uses distinct `cutColor` highlighting
- **Atomic Operation**: Ensures both copy and delete succeed or fail together

#### 4. **Select Operations** (`args.select = true`)

- **Directional Selection**: Smart selection based on navigation direction
- **Downward**: Selects from cursor to end of target line
- **Upward**: Selects from beginning of target line to cursor
- **Same Line**: Selects entire current line
- **Visual Preview**: Shows exact selection boundaries during input

## Complete Operation Matrix

### All Supported Argument Combinations

The module supports **8 distinct operation modes** based on argument combinations:

#### **Mode 1: Navigation Only** (default)

```typescript
// No args or args = {}
```

- **Behavior**: Simply moves cursor to target line
- **Use Case**: Basic line navigation
- **Example**: `goto-line.goto` → input `42` → cursor moves to line 42

#### **Mode 2: Copy Single Line**

```typescript
args = { copy: true };
```

- **Behavior**: Copies entire target line to clipboard (without selection)
- **Cursor**: Stays at original position after copy
- **Use Case**: Copy distant line without navigating to it
- **Example**: Copy line 100 while staying on line 10

#### **Mode 3: Delete Single Line**

```typescript
args = { delete: true };
```

- **Behavior**: Deletes entire target line with line break
- **Auto-Reindent**: Automatically reindents surrounding code
- **Use Case**: Remove specific line by number
- **Example**: Delete line 42 from current position

#### **Mode 4: Cut Single Line** (Copy + Delete)

```typescript
args = { copy: true, delete: true };
```

- **Behavior**: Copies target line to clipboard AND deletes it
- **Atomic**: Both operations succeed or fail together
- **Use Case**: Move line content to clipboard for pasting elsewhere
- **Example**: Cut line 15 for moving to different location

#### **Mode 5: Select to Target**

```typescript
args = { select: true };
```

- **Behavior**: Creates selection from cursor to target line
- **Direction-Aware**: Intelligent selection boundaries based on navigation direction
- **Use Case**: Select large blocks of code by line numbers
- **Example**: Select from current line to line 100

#### **Mode 6: Select and Copy** (Multi-line Copy)

```typescript
args = { select: true, copy: true };
```

- **Behavior**: Selects from cursor to target, copies selection, then deselects
- **Selection Cleared**: Cursor returns to original position after copy
- **Use Case**: Copy large blocks without keeping them selected
- **Example**: Copy lines 10-50 to clipboard

#### **Mode 7: Select and Delete** (Multi-line Delete)

```typescript
args = { select: true, delete: true };
```

- **Behavior**: Selects from cursor to target, then deletes entire selection
- **Auto-Reindent**: Reindents remaining code after deletion
- **Use Case**: Remove large blocks of code by line range
- **Example**: Delete lines 10-50

#### **Mode 8: Select, Copy and Delete** (Multi-line Cut)

```typescript
args = { select: true, copy: true, delete: true };
```

- **Behavior**: Selects range, copies to clipboard, then deletes selection
- **Most Powerful**: Combines all operations in atomic transaction
- **Use Case**: Move large blocks of code to different locations
- **Example**: Cut lines 10-50 for pasting elsewhere

### Behavior Differences: Single Line vs Multi-Line Operations

#### **Without Selection** (`select: false` or undefined)

- **Copy**: Uses VS Code's native line copy behavior
- **Delete**: Removes entire line including line break
- **Target**: Operations apply only to the target line
- **Cursor**: Generally stays at original position (except basic navigation)

#### **With Selection** (`select: true`)

- **Copy**: Copies exact selected text range
- **Delete**: Removes selected range with smart reindenting
- **Target**: Operations apply to entire selection from cursor to target
- **Cursor**: Creates and manipulates selections

### Selection Logic Details

```typescript
// Downward selection (current line 5, target line 10)
// From: cursor position → To: end of line 10
const selection = new vscode.Selection(currentPosition, endOfTargetLine);

// Upward selection (current line 10, target line 5)
// From: beginning of line 5 → To: cursor position
const selection = new vscode.Selection(beginningOfTargetLine, currentPosition);
```

## Practical Usage Examples

### Scenario-Based Workflows

#### **Scenario 1: Code Review Navigation**

```typescript
// Jump to specific line mentioned in review
Command: vstoys.goto-line.goto
Input: "147"
Result: Cursor moves to line 147 for inspection
```

#### **Scenario 2: Copy Function Definition**

```typescript
// Copy entire function at line 85 without navigating
Command: vstoys.goto-line.goto
Args: { copy: true }
Input: "85"
Result: Line 85 copied to clipboard, cursor stays in place
```

#### **Scenario 3: Delete Obsolete Code Block**

```typescript
// Remove lines 20-35 containing old implementation
Command: vstoys.goto-line.goto (from line 20)
Args: { select: true, delete: true }
Input: "35"
Result: Lines 20-35 deleted, code auto-reindented
```

#### **Scenario 4: Move Code Block**

```typescript
// Step 1: Cut lines 50-75 for relocation
Command: vstoys.goto-line.goto (from line 50)
Args: { select: true, copy: true, delete: true }
Input: "75"
Result: Lines 50-75 cut to clipboard

// Step 2: Navigate to target location and paste
Command: vstoys.goto-line.goto
Input: "120"
// Then Ctrl+V to paste the moved block
```

#### **Scenario 5: Relative Movement with Operations**

```typescript
// Copy next 10 lines from current position
Command: vstoys.goto-line.goto-relative
Args: { select: true, copy: true }
Input: "+10" (or "j10")
Result: Next 10 lines copied to clipboard
```

#### **Scenario 6: Vim-Style Line Deletion**

```typescript
// Delete 5 lines upward (vim: "5dk" equivalent)
Command: vstoys.goto-line.goto-relative
Args: { select: true, delete: true }
Input: "k5" (or "-5")
Result: 5 lines above cursor deleted
```

### Advanced Integration Examples

#### **With Hyper Module**

```typescript
// Example keybinding in hyper layer
{
  "key": "d",
  "command": "vstoys.goto-line.goto",
  "args": { "delete": true },
  "when": "vstoys.hyper.delete-layer.active"
}
// Usage: Activate delete-layer → press 'd' → input line number → line deleted
```

#### **Command Chaining**

```typescript
{
  "command": "vstoys.goto-line.goto",
  "args": {
    "copy": true,
    "executeCommandAfterGoto": "editor.action.formatDocument"
  }
}
// Usage: Copy line and auto-format document afterwards
```

## Visual Preview System

### Real-Time Highlighting

The preview system provides **immediate visual feedback** during input validation:

#### Preview Types

1. **Single Line Preview**: Highlights target line for cursor movement
2. **Selection Preview**: Shows multi-line selection boundaries
3. **Operation Preview**: Color-coded based on operation type
4. **Character-Level Precision**: Accurate selection boundaries for partial lines

#### Highlighting Strategy

- **Whole-Line Decorations**: For complete lines in selection
- **Character-Level Decorations**: For partial line selections (start/end)
- **Mixed Decorations**: Combines both types for complex selections
- **Efficient Updates**: Clears previous highlights before applying new ones

### Color Configuration

```json
{
  "vstoys.goto-line.selectColor": "editor.wordHighlightBackground",
  "vstoys.goto-line.deleteColor": "inputValidation.errorBackground",
  "vstoys.goto-line.copyColor": "editor.findRangeHighlightBackground",
  "vstoys.goto-line.cutColor": "editor.findMatchHighlightBackground"
}
```

**Color Types Supported**:

- **Theme Color IDs**: `editor.background`, `inputValidation.errorBackground`
- **Hex Colors**: `#ff0000`, `#00ff00ff`
- **Auto-Detection**: System determines appropriate color type

## Configuration System

### Settings Structure

```json
{
  "vstoys.goto-line.enabled": true,
  "vstoys.goto-line.upCharacter": "k",
  "vstoys.goto-line.downCharacter": "j",
  "vstoys.goto-line.highlightingEnabled": true,
  "vstoys.goto-line.selectColor": "editor.wordHighlightBackground",
  "vstoys.goto-line.deleteColor": "inputValidation.errorBackground",
  "vstoys.goto-line.copyColor": "editor.findRangeHighlightBackground",
  "vstoys.goto-line.cutColor": "editor.findMatchHighlightBackground"
}
```

### Settings Management

#### Live Configuration Updates

- **Settings Manager**: Monitors configuration changes in real-time
- **Event-Driven Updates**: Automatically updates preview system when colors change
- **Type-Safe Configuration**: TypeScript interfaces ensure configuration validity
- **Fallback Values**: Graceful degradation with sensible defaults

#### Performance Optimizations

- **Change Detection**: Only updates when settings actually change
- **Efficient Disposal**: Properly disposes old decoration types before creating new ones
- **Memory Management**: Cleans up event listeners and decorations on deactivation

## Integration with VS Code Toys

### Hyper Module Integration

- **Automatic Deactivation**: Calls `vstoys.hyper.deactivateAll` after navigation
- **Layer Compatibility**: Works seamlessly with hyper layer system
- **Command Chaining**: Supports `executeCommandAfterGoto` parameter

### Extension Architecture

- **Modular Design**: Self-contained with clean activation/deactivation
- **Proper Disposal**: All subscriptions and resources cleaned up on deactivation
- **Error Handling**: Graceful error handling with user-friendly messages
- **Debug Support**: Comprehensive logging through output channel

## Technical Implementation Details

### Input Parsing System

#### Absolute Line Parsing

```typescript
function parseAbsoluteLineInput(input: string, totalLines: number): number | null {
  const lineNumber = parseInt(input.trim());
  return isNaN(lineNumber) || lineNumber < 1 || lineNumber > totalLines ? null : lineNumber;
}
```

#### Relative Line Parsing

```typescript
function parseRelativeLineInput(input: string, settings: Settings): number | null {
  // Handles: +5, -3, k5, j10, 5
  // Returns: offset number or null for invalid input
}
```

### Navigation Core Functions

#### `navigateToLine(editor, lineOrPosition, args, printOutput)`

- **Flexible Input**: Accepts line number or VS Code Position
- **Operation Routing**: Dispatches to appropriate operation based on args
- **Selection Logic**: Creates proper selections for multi-line operations
- **Error Handling**: Validates bounds and provides user feedback

#### `navigateToRelativeLine(editor, relativeOffset, args, printOutput)`

- **Offset Calculation**: Converts relative offset to absolute target
- **Bounds Validation**: Ensures target stays within document bounds
- **Delegation**: Uses `navigateToLine` for actual navigation logic

### Preview System Architecture

#### Decoration Management

```typescript
class GotoLinePreview {
  private normalDecorationType: vscode.TextEditorDecorationType;
  private deleteDecorationType: vscode.TextEditorDecorationType;
  private copyDecorationType: vscode.TextEditorDecorationType;
  private cutDecorationType: vscode.TextEditorDecorationType;
  // + character-level versions for precise selection boundaries
}
```

#### Preview Algorithms

1. **Single Line Preview**: Simple line highlighting
2. **Selection Preview**: Complex multi-line selection with:
   - Character-level decorations for partial lines
   - Whole-line decorations for complete lines
   - Direction-aware selection boundaries

## Error Handling & Edge Cases

### Input Validation

- **Empty Input**: Clear error message requesting line number
- **Invalid Numbers**: Bounds checking with specific error messages
- **Out of Range**: Shows valid range and current position

### Navigation Edge Cases

- **Document Boundaries**: Prevents navigation beyond first/last line
- **Empty Documents**: Handles zero-line documents gracefully
- **Very Large Files**: Efficient handling of documents with many lines

### Preview Edge Cases

- **Rapid Input Changes**: Clears previous previews before applying new ones
- **Editor Changes**: Handles active editor switching during input
- **Settings Updates**: Recreates decorations when colors change

## Future Enhancement Opportunities

### Potential Additions

1. **Bookmark Integration**: Remember frequently accessed lines
2. **Search Integration**: Combine with text search for "goto line containing X"
3. **Multiple Cursor Support**: Navigate multiple cursors simultaneously
4. **Undo Integration**: Smarter undo boundaries for navigation operations
5. **Performance Optimization**: Lazy loading for very large files

### Configuration Enhancements

1. **Custom Direction Characters**: Allow any character for up/down navigation
2. **Animation Settings**: Configurable preview animation speed
3. **Sound Feedback**: Audio cues for successful/failed operations
4. **Cursor Memory**: Remember cursor position after navigation

### Operation Extensions

1. **Duplicate Operations**: Copy and paste in single operation
2. **Move Operations**: Cut and paste to different location
3. **Transform Operations**: Apply text transformations during navigation
4. **Multi-Selection**: Build multiple selections across navigation operations
