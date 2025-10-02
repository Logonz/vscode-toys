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
- **Relative Line Numbers**: Temporarily enables relative line numbers during relative navigation with automatic restoration
- **Configurable Highlighting**: Customizable colors for different operation types
- **Smart Error Handling**: Clear feedback for invalid inputs and out-of-bounds operations
- **Line Number Mode Restoration**: Intelligent restoration of line number settings after relative navigation

## Core Commands

### 1. `vstoys.goto-line.goto` - Absolute Line Navigation

**Purpose**: Navigate to a specific line number with optional operations

**Features**:

- Input validation with real-time preview
- Shows current line and total lines in placeholder
- Bounds checking (1 to document.lineCount)
- Visual preview of target line during typing
- Support for copy/cut/delete/select operations
- Command chaining via `executeCommandAfterGoto`

**Usage Examples**:

- `42` → Jump to line 42
- `1` → Jump to first line
- With args: `{select: true}` → Select from current to target line
- With args: `{copy: true, delete: true}` → Cut target line

**Supported Arguments**:

```typescript
{
  select?: boolean;                    // Create selection instead of just moving
  copy?: boolean;                      // Copy line(s) to clipboard
  delete?: boolean;                    // Delete line(s)
  executeCommandAfterGoto?: string;    // Execute command after navigation
}
```

### 2. `vstoys.goto-line.goto-relative` - Relative Line Navigation

**Purpose**: Navigate relative to current position with vim-like direction support

**Features**:

- Configurable up/down characters (default: k/j)
- Supports multiple input formats: `+5`, `-3`, `k5`, `j10`, `5`
- Temporarily enables relative line numbers for context
- Real-time preview of relative movement
- Automatic restoration of line number settings (configurable)
- Pre-filled input values via `value` argument
- Integration with hyper layer system

**Supported Input Formats**:

- `+5` → Move down 5 lines
- `-3` → Move up 3 lines
- `k5` → Move up 5 lines (vim-style)
- `j10` → Move down 10 lines (vim-style)
- `5` → Move down 5 lines (default direction)

**Supported Arguments**:

```typescript
{
  value?: string;                      // Pre-fill input box (e.g., "-", "+", "k", "j")
  select?: boolean;                    // Create selection instead of just moving
  copy?: boolean;                      // Copy line(s) to clipboard
  delete?: boolean;                    // Delete line(s)
  deactivateAllHyper?: boolean;        // Deactivate hyper layers after command
  executeCommandAfterGoto?: string;    // Execute command after navigation
}
```

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

The module supports **8 distinct operation modes** based on argument combinations:

| Mode                | Arguments                                  | Behavior                                       | Use Case                                |
| ------------------- | ------------------------------------------ | ---------------------------------------------- | --------------------------------------- |
| **1. Navigate**     | `{}`                                       | Moves cursor to target line                    | Basic line navigation                   |
| **2. Copy Line**    | `{copy: true}`                             | Copies target line to clipboard (cursor stays) | Copy distant line without navigating    |
| **3. Delete Line**  | `{delete: true}`                           | Deletes target line with auto-reindent         | Remove specific line by number          |
| **4. Cut Line**     | `{copy: true, delete: true}`               | Copies and deletes target line atomically      | Move line content to clipboard          |
| **5. Select Range** | `{select: true}`                           | Creates selection from cursor to target        | Select large blocks by line numbers     |
| **6. Copy Range**   | `{select: true, copy: true}`               | Copies selection, then deselects               | Copy blocks without keeping selection   |
| **7. Delete Range** | `{select: true, delete: true}`             | Deletes selection with auto-reindent           | Remove large blocks by line range       |
| **8. Cut Range**    | `{select: true, copy: true, delete: true}` | Copies and deletes selection atomically        | Move large blocks to different location |

### Key Behavior Differences

**Without `select`** (Modes 1-4):

- Operations target only the specified line
- Cursor generally stays at original position (except navigation)
- Uses VS Code's native line behavior for copy

**With `select`** (Modes 5-8):

- Operations apply to entire range from cursor to target
- Creates and manipulates selections
- Direction-aware: upward selections start at target line, downward end at target line

## Practical Usage Examples

### Basic Workflows

#### **Code Review Navigation**

```typescript
Command: vstoys.goto-line.goto
Input: "147"
Result: Cursor moves to line 147 for inspection
```

#### **Copy Function Definition**

```typescript
Command: vstoys.goto-line.goto
Args: { copy: true }
Input: "85"
Result: Line 85 copied to clipboard, cursor stays in place
```

#### **Move Code Block**

```typescript
// Step 1: Cut lines 50-75
Command: vstoys.goto-line.goto (from line 50)
Args: { select: true, copy: true, delete: true }
Input: "75"
Result: Lines 50-75 cut to clipboard

// Step 2: Navigate and paste
Command: vstoys.goto-line.goto
Input: "120"
// Then Ctrl+V to paste
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

## Keybinding Reference

### Pre-filled Input Values

The `vstoys.goto-line.goto-relative` command supports a `value` argument that pre-fills the input box, enabling quick-access keybindings for common navigation patterns.

**Supported Value Formats**:

- `"-"` or `"+"` → Starts with direction prefix (user types number immediately)
- `"k"` or `"j"` → Starts with vim-style direction character
- `"5"` or `"-5"` → Pre-fills complete offset

**Behavior**: The input box opens with the value pre-filled and cursor at the end, allowing immediate number entry or Enter to accept.

### Example Keybinding Configurations

#### **Quick Navigation Keybindings**

```json
// Arrow key navigation with pre-filled direction
{
  "key": "g up",
  "command": "vstoys.goto-line.goto-relative",
  "args": { "value": "-" },
  "when": "editorTextFocus && hyper-layer && hyper.count == 1"
},
{
  "key": "g down",
  "command": "vstoys.goto-line.goto-relative",
  "args": { "value": "+" },
  "when": "editorTextFocus && hyper-layer && hyper.count == 1"
},
{
  "key": "up",
  "command": "vstoys.goto-line.goto-relative",
  "args": { "value": "-" },
  "when": "editorTextFocus && hyper-layer && hyper.count == 1"
},
{
  "key": "down",
  "command": "vstoys.goto-line.goto-relative",
  "args": { "value": "+" },
  "when": "editorTextFocus && hyper-layer && hyper.count == 1"
}
```

**Usage**: Press `g` + arrow key (or just arrow key) in hyper layer, then immediately type the number of lines to move (e.g., `5` to go 5 lines in that direction).

#### **Delete Line Range (dl)**

```json
{
  "key": "d l",
  "command": "vstoys.goto-line.goto-relative",
  "args": {
    "select": true,
    "delete": true
  },
  "when": "editorTextFocus && hyper-layer && hyper.count == 1"
}
```

**Usage**: Press `d` + `l` in hyper layer, then enter relative offset (e.g., `+10` or `j10`) to delete from current line to target line.

**Example Workflow**:

1. Position cursor at line 20
2. Press `d` + `l`
3. Type `+5` or `j5`
4. Lines 20-25 are deleted with auto-reindent

#### **Yank (Copy) Operations**

```json
// Copy single line at distance (yy)
{
  "key": "y y",
  "command": "vstoys.goto-line.goto-relative",
  "args": { "copy": true },
  "when": "editorTextFocus && hyper-layer && !editorReadonly"
},

// Copy line range (yl)
{
  "key": "y l",
  "command": "vstoys.goto-line.goto-relative",
  "args": {
    "select": true,
    "copy": true
  },
  "when": "editorTextFocus && hyper-layer && !editorReadonly"
}
```

**yy Usage**: Press `y` twice, then enter offset to copy that specific line without navigating.

**yl Usage**: Press `y` + `l`, then enter offset to copy range from current line to target.

**Example Workflows**:

_Single Line Copy (yy)_:

1. Cursor at line 20
2. Press `y` + `y`
3. Type `+10` or `j10`
4. Line 30 is copied to clipboard
5. Cursor stays at line 20

_Range Copy (yl)_:

1. Cursor at line 20
2. Press `y` + `l`
3. Type `+10` or `j10`
4. Lines 20-30 copied to clipboard
5. Selection cleared, cursor returns to line 20

#### **Visual (Select) Operations**

```json
{
  "key": "v l",
  "command": "vstoys.goto-line.goto-relative",
  "args": { "select": true },
  "when": "editorTextFocus && hyper-layer && !editorReadonly"
}
```

**Usage**: Press `v` + `l`, then enter offset to create selection from current line to target.

**Example Workflow**:

1. Cursor at line 20
2. Press `v` + `l`
3. Type `+10` or `j10`
4. Lines 20-30 are selected
5. Can now apply other commands to selection

### Keybinding Design Patterns

**Two-Key Mnemonics**: The example keybindings follow vim-inspired patterns where the first key indicates the operation (`d`=delete, `y`=yank/copy, `v`=visual/select) and the second key indicates the target scope (`l`=line).

**Context-Aware Bindings**: All examples use `when` clauses for appropriate activation:

- `editorTextFocus`: Only active when editing text
- `hyper-layer`: Requires hyper layer activation
- `hyper.count == 1`: Only for single-count operations
- `!editorReadonly`: Excluded in read-only editors (for modify operations)

**Progressive Input Pattern**: The `value` argument enables a fluid workflow:

1. Keybinding provides operation context (e.g., direction via `"-"` or `"+"`)
2. User types distance number immediately
3. Preview updates in real-time
4. Enter confirms operation

This creates an "operation → distance → confirm" workflow similar to vim's operator-pending mode.

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
  "vstoys.goto-line.defaultLineNumberMode": "auto",
  "vstoys.goto-line.highlightingEnabled": true,
  "vstoys.goto-line.selectColor": "editor.wordHighlightBackground",
  "vstoys.goto-line.deleteColor": "inputValidation.errorBackground",
  "vstoys.goto-line.copyColor": "editor.findRangeHighlightBackground",
  "vstoys.goto-line.cutColor": "editor.findMatchHighlightBackground"
}
```

### Settings Descriptions

#### `vstoys.goto-line.enabled`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable the Goto Line module

#### `vstoys.goto-line.upCharacter`
- **Type**: `string`
- **Default**: `"k"`
- **Description**: Character prefix for moving up in relative goto (e.g., 'k5' to go up 5 lines)

#### `vstoys.goto-line.downCharacter`
- **Type**: `string`
- **Default**: `"j"`
- **Description**: Character prefix for moving down in relative goto (e.g., 'j5' to go down 5 lines)

#### `vstoys.goto-line.defaultLineNumberMode`
- **Type**: `"auto" | "on" | "off" | "interval" | "relative"`
- **Default**: `"auto"`
- **Description**: Line number mode to restore after relative goto operations
- **Options**:
  - `"auto"`: Detects your line number mode at extension startup and restores to that mode (requires window reload to detect changes)
  - `"on"`: Always restore to absolute line numbers
  - `"off"`: Always restore to no line numbers (relative numbers still show during goto-line operations)
  - `"interval"`: Always restore to interval mode (line numbers every 10 lines)
  - `"relative"`: Always restore to relative line numbers
- **Note**: If you change this setting or your `editor.lineNumbers` setting, you need to reload the window for the change to take effect

#### `vstoys.goto-line.highlightingEnabled`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable line highlighting preview when using goto commands

#### Color Settings
All color settings accept either theme color IDs (e.g., `"editor.wordHighlightBackground"`) or hex colors (e.g., `"#ff0000"`):

- **`vstoys.goto-line.selectColor`**: Color for highlighting lines during selection operations
- **`vstoys.goto-line.deleteColor`**: Color for highlighting lines during delete operations
- **`vstoys.goto-line.copyColor`**: Color for highlighting lines during copy operations
- **`vstoys.goto-line.cutColor`**: Color for highlighting lines during cut operations (copy + delete)

### Settings Management

#### Startup Detection

- **Line Number Mode Detection**: Automatically detects your current `editor.lineNumbers` setting at extension startup
- **Stable Restoration**: Uses the detected mode consistently throughout the session (no runtime detection issues)
- **Explicit Override**: Can explicitly set the restoration mode instead of using auto-detection

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

## Error Handling

The module handles common edge cases gracefully:

- **Input Validation**: Real-time bounds checking with clear error messages
- **Document Boundaries**: Prevents navigation beyond first/last line
- **Empty Documents**: Handles zero-line documents without errors
- **Preview Management**: Clears stale previews on rapid input changes or editor switching
- **Settings Updates**: Automatically recreates decorations when colors change

---

**Note**: For future enhancement ideas and potential features, see [FUTURE.md](./FUTURE.md)
