# Registers Module - Context & Design

## User Requirements & Intent

The user wanted to create a **Neovim-style registers system** for VSCode that provides:

### Core Functionality
- **5 numbered registers** (1-5) for storing copy/paste content  
- **Key chord copying**: `y 1` copies to register 1, `y 2` to register 2, etc.
- **Key chord pasting**: Similar pattern for pasting from registers
- **Quick pick menu**: `y 6` (or equivalent) shows a picker with all stored content
- **Simple initial implementation**: Focus on core functionality over complex keybindings

### User Experience Goals
- **Neovim familiarity**: Behavior similar to Neovim's register system
- **Visual feedback**: Clear indication of what's stored in each register
- **Quick access**: Both direct register access (1-5) and visual picker interface
- **Complete register overview**: Show all 5 registers regardless of content status

## Implementation Decisions Based on User Feedback

### Quick Pick Enhancements
1. **Keyboard shortcuts in pickers**: User requested pressing 1-5 within quick pick menus for instant selection
2. **Show all registers**: User specifically requested showing all 5 registers (not just non-empty ones)
3. **Empty register indication**: Show "Empty" for registers without content instead of hiding them
4. **Dual picker system**: Separate copy and paste pickers for different workflows
5. **Configuration flexibility**: User requested option to toggle showing empty registers vs content-only view

### Architecture Choices
- **Session-based storage**: In-memory only (no persistence across VSCode sessions)
- **Line fallback**: When selection is empty, copy/paste entire line (standard VSCode behavior)
- **Smart text handling**: Preview truncation, timestamp tracking, content validation
- **Logical separation**: Copy picker always allows access to registers; paste picker respects empty register preferences

## Current Commands & Usage

### Direct Register Commands
- `vstoys.registers.copyToRegister1-5`: Copy selection to specific register
- `vstoys.registers.pasteFromRegister1-5`: Paste from specific register

### Quick Pick Commands  
- `vstoys.registers.showRegisterCopyPicker`: Show all registers for copying TO
- `vstoys.registers.showRegisterPastePicker`: Show all registers for pasting FROM

### Utility Commands
- `vstoys.registers.clearAllRegisters`: Clear all register content

## Technical Implementation Notes

### RegisterManager Class
- Stores content with timestamps in Map<number, RegisterContent>
- Provides preview generation and content validation
- Handles register overflow and edge cases

### RegisterQuickPick Class
- **Copy picker**: Shows all registers, returns register number for copying
- **Paste picker**: Shows all registers, returns content for pasting  
- **Keyboard shortcuts**: Direct 1-5 selection within both pickers
- **Empty register handling**: Visual indication and appropriate warnings

### Integration Pattern
- Follows VSCode Toys module pattern with proper activation/deactivation
- Uses package injection system (.registers-package.jsonc)
- Proper error handling and user feedback

## User Workflow Examples

### Typical Usage Patterns
1. **Copy to register**: Select text → trigger copy command → choose register (1-5)
2. **Paste from register**: Position cursor → trigger paste command → choose register
3. **Quick pick copy**: Select text → open copy picker → press number or use arrows
4. **Quick pick paste**: Position cursor → open paste picker → press number or use arrows

### Key Binding Suggestions (User Implementation)
- Copy picker: `y 6` or similar chord
- Paste picker: `p 6` or similar chord  
- Direct register access: `y 1`, `y 2`, `p 1`, `p 2`, etc.

## Future Enhancement Possibilities

### User-Mentioned Interest Areas
- **Dynamic preview length**: Adapt to quick picker width (investigated but VS Code API limitations)
- **Persistence**: Cross-session register storage
- **Integration**: With dot-repeat module for repeated operations
- **Enhanced keybindings**: More sophisticated key chord systems

### Technical Considerations
- **Performance**: Current in-memory approach is fast and simple
- **Scalability**: Could extend to more registers if needed
- **Configuration**: MaxPreviewLength and enable/disable settings available
- **Accessibility**: Standard VS Code quick pick behavior maintained

## Configuration Options

### Current Settings
- **`vstoys.registers.enabled`** (boolean, default: true): Enable/disable the registers module
- **`vstoys.registers.maxPreviewLength`** (number, default: 200): Maximum preview length in quick pick menus
- **`vstoys.registers.showEmptyRegisters`** (boolean, default: true): Show all registers including empty ones in quick pick menus

### Behavior Details
- **Copy Picker**: Always shows registers (overrides showEmptyRegisters if needed) - users must have somewhere to copy to
- **Paste Picker**: Respects showEmptyRegisters setting - when false, only shows registers with content
- **Keyboard Shortcuts**: Work regardless of showEmptyRegisters setting for maximum usability

## Recent Fixes & Improvements

### Code Quality Improvements
1. **Refactored picker logic**: Eliminated code duplication using `hasContent || showEmptyRegisters` condition
2. **Fixed configuration inconsistency**: Both pickers now use consistent default values
3. **Logical bug fix**: Copy picker no longer blocks when all registers are empty

### Bug Fixes
- **Copy picker logic error**: Fixed issue where copy picker would show "No registers contain content" and prevent copying when `showEmptyRegisters = false` and all registers were empty
- **Configuration mismatch**: Fixed inconsistent default values between copy and paste pickers
- **Fallback behavior**: Copy picker now shows all registers when needed, ensuring users can always copy

### User-Driven Improvements
- **Configuration flexibility**: Added `showEmptyRegisters` option per user request
- **Code cleanliness**: Refactored based on user suggestion to improve maintainability

## Design Philosophy

The module prioritizes **simplicity and familiarity** over complex features:
- Clear visual feedback over hidden state
- Consistent behavior between copy and paste operations  
- Standard VS Code UX patterns (quick pick, commands, error messages)
- Neovim-inspired functionality adapted to VS Code conventions
- **Logical correctness**: Copy operations never blocked by empty state; paste operations provide appropriate feedback