# Goto Line - Enhanced Line Navigation

Navigate to any line with vim-style efficiency and powerful operations. Jump, select, copy, delete, or cut lines with real-time visual preview.

## Features

- 🎯 **Absolute & Relative Navigation** - Jump to specific lines or move by offset
- 👁️ **Live Preview** - See exactly what will happen before you commit
- ⚡ **Vim-Style Operations** - Combine navigation with copy/delete/select in one step
- 🎨 **Visual Feedback** - Color-coded highlighting for different operation types
- ⌨️ **Smart Input** - Multiple input formats: `+5`, `-3`, `k10`, `j5`, or plain `42`

## Quick Start

### Basic Navigation

**Absolute Line Jump:**

```
Command Palette → "VsToys - Goto Line: Go to Line"
Type: 42 → Press Enter
Result: Cursor jumps to line 42
```

**Relative Line Navigation:**

```
Command Palette → "VsToys - Goto Line: Go to Relative Line"
Type: +10 or j10 → Press Enter
Result: Move down 10 lines
```

### Supported Input Formats (Relative)

- `+5` or `j5` - Move down 5 lines
- `-3` or `k3` - Move up 3 lines
- `5` - Move down 5 lines (default direction)

> **Tip:** Configure `upCharacter` and `downCharacter` in settings to use your preferred vim-style keys (default: `k` for up, `j` for down)

## Powerful Operations

Combine navigation with operations by using keybindings with arguments:

### Copy Operations

**Copy a single distant line:**

```json
{
  "key": "ctrl+shift+c",
  "command": "vstoys.goto-line.goto-relative",
  "args": { "copy": true }
}
```

Usage: `Ctrl+Shift+C` → type `+10` → Line 10 ahead copied to clipboard (cursor stays in place)

**Copy a range of lines:**

```json
{
  "key": "ctrl+shift+y",
  "command": "vstoys.goto-line.goto-relative",
  "args": { "select": true, "copy": true }
}
```

Usage: `Ctrl+Shift+Y` → type `+10` → Lines from cursor to +10 copied to clipboard

### Delete Operations

**Delete a single line:**

```json
{
  "key": "ctrl+shift+d",
  "command": "vstoys.goto-line.goto-relative",
  "args": { "delete": true }
}
```

**Delete a range of lines:**

```json
{
  "key": "ctrl+shift+delete",
  "command": "vstoys.goto-line.goto-relative",
  "args": { "select": true, "delete": true }
}
```

Usage: Type `+5` → Deletes 5 lines including current, with auto-reindent

### Cut Operations

Combine `copy` and `delete` to cut:

```json
{
  "key": "ctrl+shift+x",
  "command": "vstoys.goto-line.goto-relative",
  "args": { "select": true, "copy": true, "delete": true }
}
```

### Select Operations

Create selections for further manipulation:

```json
{
  "key": "ctrl+shift+v",
  "command": "vstoys.goto-line.goto-relative",
  "args": { "select": true }
}
```

## Vim-Style Workflows

For vim users, here's a recommended keybinding setup (requires [hyper layer](../hyper/README.md)):

```json
{
  "keybindings": [
    // Quick navigation with arrow keys
    {
      "key": "up",
      "command": "vstoys.goto-line.goto-relative",
      "args": { "value": "-" },
      "when": "editorTextFocus && hyper-layer"
    },
    {
      "key": "down",
      "command": "vstoys.goto-line.goto-relative",
      "args": { "value": "+" },
      "when": "editorTextFocus && hyper-layer"
    },

    // Delete to line (dl)
    {
      "key": "d l",
      "command": "vstoys.goto-line.goto-relative",
      "args": { "select": true, "delete": true },
      "when": "editorTextFocus && hyper-layer"
    },

    // Yank single line (yy)
    {
      "key": "y y",
      "command": "vstoys.goto-line.goto-relative",
      "args": { "copy": true },
      "when": "editorTextFocus && hyper-layer"
    },

    // Yank line range (yl)
    {
      "key": "y l",
      "command": "vstoys.goto-line.goto-relative",
      "args": { "select": true, "copy": true },
      "when": "editorTextFocus && hyper-layer"
    },

    // Visual select to line (vl)
    {
      "key": "v l",
      "command": "vstoys.goto-line.goto-relative",
      "args": { "select": true },
      "when": "editorTextFocus && hyper-layer"
    }
  ]
}
```

### Vim Workflow Examples

**Delete 5 lines down:** Hyper layer → `d` + `l` → type `j5` → Enter
**Copy 10 lines up:** Hyper layer → `y` + `l` → type `k10` → Enter
**Select to line 50:** Hyper layer → `v` + `l` → type `50` → Enter

> **Note:** The `value` argument pre-fills the input box. For example, `"value": "-"` starts with `-` so you just type the number.

## Configuration

```json
{
  "vstoys.goto-line.enabled": true,
  "vstoys.goto-line.upCharacter": "k",
  "vstoys.goto-line.downCharacter": "j",
  "vstoys.goto-line.defaultLineNumberMode": "auto",
  "vstoys.goto-line.highlightingEnabled": true,
  "vstoys.goto-line.selectColor": "editor.wordHighlightBackground",
  "vstoys.goto-line.deleteColor": "editorMarkerNavigationError.headerBackground",
  "vstoys.goto-line.copyColor": "editor.findRangeHighlightBackground",
  "vstoys.goto-line.cutColor": "editorMarkerNavigationWarning.headerBackground"
}
```

### Settings

#### Line Number Restoration

**`vstoys.goto-line.defaultLineNumberMode`**

Controls how line numbers are restored after relative goto operations:

- **`"auto"`** (default): Detects your `editor.lineNumbers` setting at extension startup and restores to that mode
- **`"on"`**: Always restore to absolute line numbers
- **`"off"`**: Always restore to no line numbers (relative numbers still show during goto operations)
- **`"interval"`**: Always restore to interval mode (line numbers every 10 lines)
- **`"relative"`**: Always restore to relative line numbers

> **Note:** If you change this setting or your `editor.lineNumbers` setting, reload the window (Developer: Reload Window) for the change to take effect.

#### Direction Characters

**`vstoys.goto-line.upCharacter`** and **`vstoys.goto-line.downCharacter`**

Customize the vim-style direction prefixes (default: `"k"` for up, `"j"` for down).

### Color Customization

Colors can be:

- **Theme color IDs**: `editor.wordHighlightBackground`, `inputValidation.errorBackground`
- **Hex values**: `#ff0000`, `#00ff00ff`

The preview system uses different colors for different operations:

- **Select**: Default word highlight color
- **Delete**: Red/error color
- **Copy**: Find range highlight color
- **Cut**: Orange/warning color (when both copy and delete)

## Commands

| Command                          | Description                           |
| -------------------------------- | ------------------------------------- |
| `vstoys.goto-line.goto`          | Navigate to absolute line number      |
| `vstoys.goto-line.goto-relative` | Navigate relative to current position |

### Command Arguments

Both commands support these arguments:

| Argument                  | Type    | Description                               |
| ------------------------- | ------- | ----------------------------------------- |
| `value`                   | string  | Pre-fill input box (relative only)        |
| `select`                  | boolean | Create selection instead of moving cursor |
| `copy`                    | boolean | Copy line(s) to clipboard                 |
| `delete`                  | boolean | Delete line(s)                            |
| `executeCommandAfterGoto` | string  | Run command after navigation              |
| `deactivateAllHyper`      | boolean | Deactivate hyper layers after command     |

## Operation Matrix

| Args                                       | Behavior                        |
| ------------------------------------------ | ------------------------------- |
| `{}`                                       | Move cursor to target line      |
| `{copy: true}`                             | Copy target line without moving |
| `{delete: true}`                           | Delete target line              |
| `{copy: true, delete: true}`               | Cut target line                 |
| `{select: true}`                           | Select from cursor to target    |
| `{select: true, copy: true}`               | Copy range, then deselect       |
| `{select: true, delete: true}`             | Delete range with auto-reindent |
| `{select: true, copy: true, delete: true}` | Cut range                       |

## Tips & Tricks

1. **Live Preview**: As you type, the preview shows exactly what will be selected/copied/deleted
2. **Auto-Reindent**: Delete operations automatically reindent surrounding code
3. **Relative Mode**: Temporarily enables relative line numbers for easier navigation, then restores your preferred mode
4. **Line Number Restoration**: Configure `defaultLineNumberMode` to control how line numbers are restored after relative navigation
5. **Command Chaining**: Use `executeCommandAfterGoto` to run commands after navigation
6. **Pre-filled Input**: Use `value` argument in keybindings for faster workflows

## Examples

### Example 1: Copy Function 20 Lines Away

```
1. Position cursor at line 10
2. Run command with {copy: true} argument
3. Type +20
4. Function at line 30 copied to clipboard
5. Cursor stays at line 10
```

### Example 2: Delete Code Block

```
1. Position cursor at start of block (line 50)
2. Run command with {select: true, delete: true} argument
3. Type +15
4. Lines 50-65 deleted and code auto-reindented
```

### Example 3: Move Code Block

```
1. Position at start of block
2. Cut block: {select: true, copy: true, delete: true} → type offset
3. Navigate to destination line
4. Paste (Ctrl+V)
```

## Integration

Works seamlessly with other VS Code Toys modules:

- **Hyper Layer**: Create vim-style modal editing workflows
- **Registers**: Store multiple cut/copied ranges
- **Motions**: Combine with text object operations

---

For detailed technical documentation, see [CLAUDE.md](./CLAUDE.md).
