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
- **Automatic**: `i` `a` - Finds closest text object of any type

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
- `2dii` - Delete inside 2nd closest text object (automatic)

### Automatic Text Object Selection

The `i` and `a` characters work as "automatic" text objects that find the closest text object of any type:

- `dii` - Delete inside closest text object (quotes, brackets, etc.)
- `2yaa` - Yank around 2nd closest text object
- `vii` - Select inside closest text object

Example: In `("hello")` with cursor on `h`, `dii` deletes `hello` (closest), `2dii` deletes `("hello")` (second closest).

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
- `textObjects.ts` - Text object detection algorithms (improved bracket finding logic)
- `.motions-package.jsonc` - VS Code commands and settings configuration

### Text Object Detection Improvements

**Fixed Bracket Nesting Issues**: The bracket finding algorithm was completely rewritten to use the same proximity-based logic as quotes, fixing issues where nested brackets would select the wrong scope.

**Automatic Text Object Detection**: New `findAnyTextObject` function finds all text objects around the cursor and sorts them by proximity, enabling automatic text object selection with `i` and `a` characters.

**Key Algorithm Changes**:

- Single-pass collection of opening/closing delimiters
- Proximity-based pairing (closest delimiters to cursor are paired first)
- Distance-based sorting for automatic selection
- Consistent behavior across all text object types

### Key Features

- **Context management** - Sets `vstoys.motions.inputActive` for escape key binding
- **Live config updates** - Settings changes apply immediately
- **Visual feedback** - Yank operations highlight affected text
- **Multi-cursor support** - Works with multiple selections
- **Reliable bracket detection** - Fixed nesting issues with improved proximity-based algorithm
- **Automatic text object selection** - Smart detection of closest text objects with `i`/`a`

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
