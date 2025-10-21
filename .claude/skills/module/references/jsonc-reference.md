# JSONC Reference: Complete Schema

This document provides a complete reference for all possible fields in a `.module-name-package.jsonc` file.

## Structure Overview

```jsonc
{
  "contributes": {
    "commands": [],
    "keybindings": [],
    "configuration": {},
    "fileDecorations": [],
    "views": {},
    "menus": {},
    "viewsContainers": {}
  }
}
```

Only include the top-level sections you need for your module.

## Commands: Complete Reference

### Basic Command

```jsonc
{
  "command": "vstoys.module.action",
  "title": "Module: Do Action"
}
```

### Complete Command with All Fields

```jsonc
{
  "command": "vstoys.module.complexAction",
  "title": "Module: Complex Action",
  "category": "VsToys",
  "description": "Longer description of what this command does",
  "icon": "$(star)",
  "enablement": "true"
}
```

### Icon Syntax

Icons use VS Code's built-in icon identifiers:

```jsonc
"icon": "$(star)"           // Star icon
"icon": "$(add)"            // Plus icon
"icon": "$(trash)"          // Trash icon
"icon": "$(check)"          // Checkmark
"icon": "$(x)"              // Close/X
"icon": "$(folder)"         // Folder
"icon": "$(file)"           // File
"icon": "$(edit)"           // Edit/pencil
"icon": "$(copy)"           // Copy
"icon": "$(refresh)"        // Refresh
"icon": "$(search)"         // Search
"icon": "$(settings)"       // Settings gear
```

Or reference a file:
```jsonc
"icon": "$(file) ./path/to/icon.svg"
```

## Keybindings: Complete Reference

### Minimal Keybinding

```jsonc
{
  "command": "vstoys.module.action",
  "key": "ctrl+shift+x"
}
```

### Complete Keybinding with All Fields

```jsonc
{
  "command": "vstoys.module.action",
  "key": "ctrl+shift+x",
  "mac": "cmd+shift+x",
  "linux": "ctrl+shift+x",
  "when": "editorTextFocus",
  "args": {
    "param1": "value1",
    "param2": 42
  }
}
```

### Key Syntax

Single key:
```jsonc
"key": "a"
"key": "1"
"key": "f19"
"key": "escape"
"key": "enter"
"key": "tab"
"key": "space"
"key": "backspace"
"key": "delete"
"key": "home"
"key": "end"
"key": "pageUp"
"key": "pageDown"
```

With modifiers:
```jsonc
"key": "ctrl+a"
"key": "shift+a"
"key": "alt+a"
"key": "cmd+a"           // macOS only
"key": "ctrl+shift+a"
"key": "ctrl+alt+a"
"key": "ctrl+shift+alt+a"
```

Multi-key sequences:
```jsonc
"key": "ctrl+k ctrl+v"   // Press Ctrl+K, then Ctrl+V
```

### Platform-Specific Keybindings

```jsonc
{
  "command": "vstoys.module.action",
  "key": "ctrl+shift+x",
  "mac": "cmd+shift+x",
  "linux": "ctrl+shift+x",
  "win": "ctrl+shift+x"
}
```

### When Conditions: Complete List

**Basic conditions**:
```jsonc
"when": "true"
"when": "false"
"when": "true"
```

**Editor states**:
```jsonc
"when": "editorTextFocus"              // User is typing in editor
"when": "editorFocus"                  // Editor has focus (includes UI focus)
"when": "editorReadOnly"               // File is read-only
"when": "!editorReadOnly"              // File is NOT read-only
"when": "editorHasSelection"           // Text is selected
"when": "!editorHasSelection"          // No text selected
"when": "editorHasMultipleSelections"  // Multiple cursors/selections
"when": "editorLangId == typescript"   // Language is TypeScript
"when": "editorLangId != markdown"     // Language is NOT markdown
```

**VS Code states**:
```jsonc
"when": "resourceScheme == file"       // Working with a file (not diff/remote)
"when": "inputFocus"                   // Something in UI has focus
"when": "terminalFocus"                // Terminal has focus
"when": "sideBarFocus"                 // Side bar has focus
"when": "explorerViewletVisible"       // Explorer is visible
"when": "scmViewletFocused"            // Git/Source Control is focused
```

**Custom vstoys contexts**:
```jsonc
"when": "vstoys.module.active"         // Your module is active/enabled
"when": "vstoys.module.someContext"    // Custom context you set via setContext
"when": "hyper-layer"                  // Hyper-layer module is active
"when": "!vstoys.module.active"        // NOT active
```

**Combinations**:
```jsonc
"when": "editorTextFocus && vstoys.module.active"
"when": "(vstoys.module.context1 || vstoys.module.context2)"
"when": "editorTextFocus && !editorReadOnly && vstoys.module.active"
```

### Arguments

Arguments are passed to the command handler:

```jsonc
{
  "command": "vstoys.module.action",
  "key": "ctrl+x",
  "args": {
    "mode": "fast",
    "count": 5
  }
}
```

Received in code:
```typescript
vscode.commands.registerCommand("vstoys.module.action", (args) => {
  console.log(args.mode);  // "fast"
  console.log(args.count); // 5
});
```

## Configuration: Complete Reference

### Minimal Setting

```jsonc
"vstoys.module.setting": {
  "type": "string"
}
```

### Complete Setting with All Fields

```jsonc
"vstoys.module.setting": {
  "type": "string",
  "default": "defaultValue",
  "description": "What this does",
  "longDescription": "Longer detailed description",
  "order": 2000,
  "enum": ["option1", "option2"],
  "enumDescriptions": ["First option", "Second option"],
  "markdownEnumDescriptions": ["**Bold** first", "_Italic_ second"],
  "markdownDescription": "Description with **markdown** support",
  "scope": "resource",
  "tags": ["css"]
}
```

### Type: String

```jsonc
"vstoys.module.stringOption": {
  "type": "string",
  "default": "hello",
  "description": "A string setting",
  "pattern": "^[a-z]+$",         // Regex validation
  "patternErrorMessage": "Must be lowercase",
  "minLength": 1,                // Minimum length
  "maxLength": 50                // Maximum length
}
```

### Type: Number

```jsonc
"vstoys.module.numberOption": {
  "type": "number",
  "default": 100,
  "description": "A numeric setting",
  "minimum": 0,                  // Minimum value
  "maximum": 1000,               // Maximum value
  "multipleOf": 10               // Must be multiple of
}
```

### Type: Integer

```jsonc
"vstoys.module.intOption": {
  "type": "integer",
  "default": 50,
  "minimum": 0,
  "maximum": 100
}
```

### Type: Boolean

```jsonc
"vstoys.module.boolOption": {
  "type": "boolean",
  "default": true,
  "description": "Enable this feature"
}
```

### Type: Array

```jsonc
"vstoys.module.arrayOption": {
  "type": "array",
  "default": ["item1", "item2"],
  "description": "A list of items",
  "items": {
    "type": "string"
  },
  "minItems": 1,                 // Minimum items
  "maxItems": 10,                // Maximum items
  "uniqueItems": true            // No duplicates
}
```

### Type: Object

```jsonc
"vstoys.module.objectOption": {
  "type": "object",
  "default": { "prop1": "value", "prop2": 42 },
  "description": "An object setting",
  "additionalProperties": {
    "type": "string"
  }
}
```

### Type: Enum

```jsonc
"vstoys.module.enumOption": {
  "type": "string",
  "enum": ["simple", "adaptive", "progressive"],
  "default": "adaptive",
  "enumDescriptions": [
    "Original behavior",
    "Smart adaptive mode",
    "Progressive sequences"
  ],
  "description": "Choose a mode"
}
```

### Markdown in Descriptions

```jsonc
"vstoys.module.setting": {
  "type": "string",
  "markdownDescription": "Use **bold** and _italic_ text",
  "default": "value"
}
```

### Scope Options

```jsonc
"type": "string",
"scope": "application"    // Global setting
"scope": "machine"        // Machine-specific
"scope": "window"         // Per VS Code window
"scope": "resource"       // Per workspace/file
"scope": "machine-overridable"
"scope": "window-overridable"
```

### Order Property (For UI Organization)

Lower order numbers appear first in Settings UI:

```jsonc
"vstoys.module.enabled": {
  "type": "boolean",
  "order": 2000    // First
},
"vstoys.module.color": {
  "type": "string",
  "order": 2001    // Second
},
"vstoys.module.timeout": {
  "type": "number",
  "order": 2002    // Third
}
```

## File Decorations (Advanced)

Used to display badges and colors in file explorer:

```jsonc
{
  "fileDecorations": [
    {
      "id": "myDecorator",
      "label": "My Decorator",
      "description": "Shows special files"
    }
  ]
}
```

## Common Patterns

### Module Enable/Disable Pattern

```jsonc
"contributes": {
  "configuration": {
    "properties": {
      "vstoys.module.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable module",
        "order": 2000
      }
    }
  }
}
```

### Color Configuration Pattern

```jsonc
"vstoys.module.decorationColor": {
  "type": "string",
  "default": "editor.wordHighlightBackground",
  "description": "Color for decorations",
  "order": 2001
},
"vstoys.module.decorationForegroundColor": {
  "type": "string",
  "default": "editor.foreground",
  "description": "Text color",
  "order": 2002
}
```

Supports:
- Theme color IDs: `editor.foreground`, `editorError.background`, etc.
- Hex colors: `#FF0000`, `#00FF0000`
- RGB: `rgb(255, 0, 0)`
- RGBA: `rgba(255, 0, 0, 0.5)`

### Keybinding Mode Pattern

```jsonc
"commands": [
  {
    "command": "vstoys.module.enter",
    "title": "Enter Mode"
  },
  {
    "command": "vstoys.module.exit",
    "title": "Exit Mode"
  }
],
"keybindings": [
  {
    "command": "vstoys.module.action",
    "key": "a",
    "when": "vstoys.module.modeActive"
  }
]
```

## JSON vs JSONC

**JSON** (no comments):
```json
{
  "commands": [
    {"command": "vstoys.module.action", "title": "Action"}
  ]
}
```

**JSONC** (with comments and trailing commas):
```jsonc
{
  // This is a comment
  "commands": [
    {
      "command": "vstoys.module.action",
      "title": "Action",  // Trailing comma is OK
    },
  ]
}
```

VSToys uses JSONC, so comments and trailing commas are supported.

## Validation Tips

### Check Your JSONC is Valid

1. Must have valid JSON structure (even with comments)
2. No unescaped quotes in strings
3. Proper comma usage (comma after each object except last in array)
4. Matching braces and brackets

### Test Your Settings

After adding settings to JSONC:
1. Run `npm run compile` to merge into package.json
2. Run `npm run ext` to package and install extension
3. Open VS Code Settings UI and search for `vstoys.module`
4. Verify settings appear correctly

### Debug Merge Issues

If settings don't appear:
1. Check JSONC syntax (use a JSON validator)
2. Verify filename matches pattern `.*-package.jsonc`
3. Run `npm run compile` and check package.json was updated
4. Check command palette for your commands
5. Check webpack build log for errors

## File Structure Reference

```
src/module-name/
├── .module-name-package.jsonc
│   └── contains: commands, keybindings, configuration, etc.
└── main.ts
    └── registers actual handlers
```

The JSONC file declares what should happen, main.ts implements it.

## Minimal Complete Example

```jsonc
{
  "contributes": {
    "commands": [
      {
        "command": "vstoys.hello.greet",
        "title": "Hello: Greet"
      }
    ],
    "keybindings": [
      {
        "command": "vstoys.hello.greet",
        "key": "ctrl+alt+h",
        "when": "editorTextFocus && vstoys.hello.active"
      }
    ],
    "configuration": {
      "properties": {
        "vstoys.hello.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable Hello module",
          "order": 1000
        }
      }
    }
  }
}
```
