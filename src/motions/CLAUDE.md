# Motions Module

## Overview

The Motions module brings vim-style text object operations to VSCode, allowing users to efficiently manipulate text based on structural boundaries like parentheses, quotes, brackets, etc.

## Current Features

### Text Objects Supported

- Parentheses: `(` `)`
- Brackets: `[` `]`
- Braces: `{` `}`
- Angle brackets: `<` `>`
- Quotes: `"` `'` `` ` ``

### Operations

- **`di`** - Delete inside text object (e.g., `di(` deletes content inside parentheses)
- **`da`** - Delete around text object (e.g., `da(` deletes content + parentheses)
- **`yi`** - Yank (copy) inside text object with visual highlighting
- **`ya`** - Yank (copy) around text object with visual highlighting
- **`vi`** - Select inside text object
- **`va`** - Select around text object

### Count Support

All operations support count prefixes:

- `2di(` - Delete inside 2nd outer parentheses
- `3ya"` - Yank around 3rd outer quotes

### Usage Modes

1. **Direct commands**: `vstoys.motions.di` → shows "di" → type "(" → executes
2. **Interactive mode**: `vstoys.motions.start` → type "2di(" → executes

### Configuration

- `vstoys.motions.foregroundColor` - Text color for yank highlighting
- `vstoys.motions.backgroundColor` - Background color for yank highlighting (default: `editor.wordHighlightBackground`)
- `vstoys.motions.timeout` - Highlight duration in milliseconds (default: 100ms)

## Architecture

### Files

- `main.ts` - Module activation, command registration, configuration
- `motionOperations.ts` - Core motion execution logic
- `motionInput.ts` - Input capture classes (MotionInput, InteractiveMotionInput)
- `textObjects.ts` - Text object detection algorithms
- `.motions-package.jsonc` - VS Code commands and settings configuration

### Key Features

- **Context management** - Sets `vstoys.motions.inputActive` for escape key binding
- **Live config updates** - Settings changes apply immediately
- **Visual feedback** - Yank operations highlight affected text
- **Multi-cursor support** - Works with multiple selections

## Future Enhancements

### Surround Operations (Planned)

The vim-surround functionality would be a powerful addition:

- **`ys`** - Yank surround (add surrounding)

  - `ysi(` + `"` → wraps inside parentheses with quotes
  - `ysw"` → wraps word with quotes

- **`cs`** - Change surround

  - `cs("` → changes parentheses to quotes
  - `cs"]` → changes quotes to brackets

- **`ds`** - Delete surround
  - `ds(` → removes surrounding parentheses
  - `ds"` → removes surrounding quotes

#### Implementation Considerations

Surround operations require a two-step input process:

1. First input: text object selection (e.g., `(`, `"`, `w` for word)
2. Second input: new surrounding character (for `ys` and `cs`)

This would need:

- Extended input handling in `motionInput.ts`
- New surround-specific logic in `motionOperations.ts`
- Additional commands in package configuration
- Support for word objects (`w`, `W`) and line objects (`$`)

Next consideration:
Remember the last command so that we could emulate something like a dotrepeat where pressing dot would rerun the command.

### Other Potential Enhancements

- **Case operations**: `gU` (uppercase), `gu` (lowercase), `~` (toggle case)
- **Replace operations**: `r` (replace single character)
- **Formatting**: `=` (auto-indent/format text object)
- **Extended text objects**: word (`w`), sentence (`s`), paragraph (`p`)

## Notes

The module follows VSCode Toys architecture patterns and integrates seamlessly with the extension's configuration and output systems.
