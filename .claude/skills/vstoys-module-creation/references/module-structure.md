# Module Structure & Anatomy

## Directory Layout

Every module follows this structure:

```
src/module-name/
├── main.ts                           # REQUIRED: Main entry point
├── .module-name-package.jsonc        # REQUIRED: Configuration injection
├── helper-file.ts                    # Optional: Supporting code
├── types.ts                          # Optional: TypeScript interfaces
├── subfeature/                       # Optional: Feature subdirectories
│   ├── implementation.ts
│   └── types.ts
└── README.md                         # Optional: Module documentation
```

### Naming Conventions

- **Module directory**: `src/module-name/` (kebab-case, all lowercase)
- **JSONC file**: `.module-name-package.jsonc` (leading dot, kebab-case)
- **Activation function**: `activate{ModuleName}` (PascalCase, no hyphens)
- **Configuration namespace**: `vstoys.module-name` (matches directory name)
- **Command namespace**: `vstoys.module-name.commandName` (kebab-case)
- **Context keys**: `vstoys.module-name.context` (kebab-case)

## The JSONC File

### Purpose

The `.module-name-package.jsonc` file declares everything the module contributes to VS Code:
- Commands
- Keybindings
- Configuration settings
- File decorations
- Views (advanced)

### Structure Template

```jsonc
{
  "contributes": {
    "commands": [
      // List of commands
    ],
    "keybindings": [
      // Key combinations
    ],
    "configuration": {
      "properties": {
        // Settings schema
      }
    }
  }
}
```

### Complete Example (Copy-Highlight)

```jsonc
{
  "contributes": {
    "commands": [
      {
        "command": "vstoys.copy-highlight.copy",
        "category": "VsToys",
        "title": "Copy Highlight: Copy"
      }
    ],
    "configuration": {
      "properties": {
        "vstoys.copy-highlight.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable the Copy Highlight module in VSCode Toys",
          "order": 2000
        },
        "vstoys.copy-highlight.backgroundColor": {
          "type": "string",
          "default": "editor.wordHighlightBackground",
          "description": "Background color for the copy highlighting",
          "order": 2001
        },
        "vstoys.copy-highlight.timeout": {
          "type": "number",
          "default": 100,
          "description": "Timeout duration in milliseconds",
          "order": 2003
        }
      }
    },
    "keybindings": [
      {
        "command": "vstoys.copy-highlight.copy",
        "key": "ctrl+c",
        "mac": "cmd+c",
        "when": "editorTextFocus && vstoys.copy-highlight.active"
      }
    ]
  }
}
```

### Key Concepts in JSONC

**Comments are allowed**:
```jsonc
{
  "commands": [
    // This is a command
    {
      "command": "vstoys.module.action",
      "title": "Do something"
    }
  ]
}
```

**Trailing commas are allowed**:
```jsonc
{
  "commands": [
    { "command": "vstoys.module.action", "title": "Action", },
    // Last item can have trailing comma
  ]
}
```

## The Main Implementation File

### Required Export Signature

```typescript
export function activate{ModuleName}(name: string, context: vscode.ExtensionContext) {
  // Implementation
}
```

The function name must match the module name (e.g., `activateCopyHighlight`, `activateRegisters`).

### Typical File Structure

```typescript
import * as vscode from "vscode";
import { createOutputChannel } from "../extension";

// Constants for configuration namespace
const ConfigSpace = "vstoys.module-name";

// Helper function for logging (set up in activate)
let printOutput: (content: string, reveal?: boolean) => void;

/**
 * Activates the module.
 * Called by src/extension.ts during extension activation.
 */
export function activate{ModuleName}(name: string, context: vscode.ExtensionContext) {
  // 1. Setup
  console.log(`Activating ${name}`);
  printOutput = createOutputChannel(`${name}`);
  printOutput(`${name} activating`);

  // 2. Load initial configuration
  let config = vscode.workspace.getConfiguration(ConfigSpace);
  let setting1 = config.get("setting1") as string;
  let setting2 = config.get("setting2") as number;

  // 3. Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("vstoys.module-name.commandName", async () => {
      printOutput("Command executed");
      // Implementation
    })
  );

  // 4. Register event listeners
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(`${ConfigSpace}.setting1`) ||
        event.affectsConfiguration(`${ConfigSpace}.setting2`)
      ) {
        printOutput("Configuration changed");
        config = vscode.workspace.getConfiguration(ConfigSpace);
        setting1 = config.get("setting1") as string;
        setting2 = config.get("setting2") as number;
      }
    })
  );

  // 5. Register other disposables as needed
  // (decorations, file system watchers, etc.)

  // 6. Log completion
  printOutput(`${name} activated`, false);
}
```

## Commands: Full Reference

### Command Definition in JSONC

```jsonc
{
  "command": "vstoys.module.action",     // Unique identifier
  "category": "VsToys",                   // Category in command palette
  "title": "Module: Action Title",        // Display name
  "icon": "$(icon-name)"                  // Optional: icon ID
}
```

### Command Registration in Code

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand("vstoys.module.action", async (args) => {
    // args come from the keybinding or programmatic call

    // Do work here
    const result = await someAsyncOperation();

    // Can return values to keybinding handlers
    return result;
  })
);
```

### Calling Commands Programmatically

```typescript
// Execute a command
await vscode.commands.executeCommand("vstoys.module.action", arg1, arg2);

// Set a context key
await vscode.commands.executeCommand("setContext", "vstoys.module.active", true);
```

## Keybindings: Full Reference

### Keybinding Definition in JSONC

```jsonc
{
  "command": "vstoys.module.action",
  "key": "ctrl+shift+x",                 // Windows/Linux
  "mac": "cmd+shift+x",                  // macOS override
  "when": "condition1 && condition2",    // When to enable
  "args": { "param": "value" }           // Optional arguments
}
```

### Key Syntax

```
ctrl+k ctrl+v     // Two-key sequence (Ctrl+K, Ctrl+V)
alt+shift+a       // Multiple modifiers
f19               // Function keys
cmd+/             // macOS-specific
```

### Common `when` Conditions

```jsonc
"editorTextFocus"                      // User is editing text
"!editorTextFocus"                     // NOT editing text
"vstoys.module.active"                 // Module is enabled
"vstoys.hyper-layer.hyper-layer"       // Custom context key
"!editorHasSelection"                  // No text selected
"editorReadOnly"                       // File is read-only
"resourceScheme == file"               // Only for files (not diff view)
```

### Complex Conditions

```jsonc
"when": "editorTextFocus && vstoys.module.active && !editorReadOnly"

"when": "(vstoys.module.context1 || vstoys.module.context2) && editorFocus"
```

## Configuration: Full Reference

### Configuration Property Definition in JSONC

```jsonc
"vstoys.module.settingName": {
  "type": "boolean",                    // Type: boolean, string, number, array, object
  "default": true,                      // Default value
  "description": "What this does",      // Description in settings UI
  "order": 2000,                        // Sort order in UI (lower first)
  "enum": ["option1", "option2"],       // Enum type (restricted values)
  "enumDescriptions": [                 // Descriptions for enum options
    "First option",
    "Second option"
  ],
  "minimum": 0,                         // For number types
  "maximum": 100,
  "minLength": 1,                       // For string types
  "pattern": "^[a-z]+$",                // Regex pattern for string
  "items": {                            // For array types
    "type": "string"
  },
  "additionalProperties": {             // For object types
    "type": "string"
  }
}
```

### Reading Configuration in Code

```typescript
const config = vscode.workspace.getConfiguration("vstoys.module");

// Get individual settings
const boolValue = config.get("boolSetting") as boolean;
const stringValue = config.get("stringSetting") as string;
const numberValue = config.get("numberSetting") as number;

// Get with fallback
const value = config.get("setting") ?? "default";

// Get entire configuration object
const allSettings = config.get<Record<string, any>>("");
```

### Listening for Configuration Changes

```typescript
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration((event) => {
    // Check if specific settings changed
    if (event.affectsConfiguration("vstoys.module.setting1")) {
      // Handle change
    }

    // Or check multiple settings
    if (
      event.affectsConfiguration("vstoys.module.setting1") ||
      event.affectsConfiguration("vstoys.module.setting2")
    ) {
      // Re-load all settings
    }
  })
);
```

## Module Registration in Extension

### How It Works

In `src/extension.ts`, each module must be:

1. **Imported**:
   ```typescript
   import { activateCopyHighlight } from "./copy-highlight/main";
   import { activateRegisters } from "./registers/main";
   ```

2. **Registered in the vsToys array**:
   ```typescript
   const vsToys = [
     {
       name: "Copy Highlight",
       moduleContext: "copy-highlight",
       activator: activateCopyHighlight,
       deactivator: undefined
     },
     {
       name: "Registers",
       moduleContext: "registers",
       activator: activateRegisters,
       deactivator: undefined
     }
   ];
   ```

3. **Activated in the extension's activate function**:
   ```typescript
   for (const module of vsToys) {
     // Set context and call activator
     await vscode.commands.executeCommand(
       "setContext",
       `vstoys.${module.moduleContext}.active`,
       true
     );
     module.activator(module.name, context);
   }
   ```

### What Each Field Means

- **`name`**: Display name used for output channels and logging
- **`moduleContext`**: Identifier used for configuration namespace (`vstoys.{moduleContext}`) and context keys
- **`activator`**: Function to call (must be `activate{ModuleName}` pattern)
- **`deactivator`**: Optional cleanup function (not currently used)

## Disposables & Cleanup

VS Code manages resource cleanup via disposables. Always push to `context.subscriptions`:

```typescript
// Commands
context.subscriptions.push(
  vscode.commands.registerCommand("cmd", () => {})
);

// Event listeners
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration((...) => {})
);

// File system watchers
context.subscriptions.push(
  vscode.workspace.createFileSystemWatcher(pattern)
);

// Decorations (also need manual dispose)
const decoration = vscode.window.createTextEditorDecorationType({...});
context.subscriptions.push(decoration);
```

## Type Safety

Module files should follow TypeScript best practices:

```typescript
import * as vscode from "vscode";

// Type interfaces for configuration
interface ModuleConfig {
  enabled: boolean;
  backgroundColor: string;
  timeout: number;
}

export function activateMyModule(
  name: string,
  context: vscode.ExtensionContext
): void {
  const config = vscode.workspace.getConfiguration("vstoys.my-module");
  const settings: ModuleConfig = {
    enabled: config.get("enabled") ?? true,
    backgroundColor: config.get("backgroundColor") ?? "default",
    timeout: config.get("timeout") ?? 100
  };
  // Use settings
}
```

## Example: Complete Minimal Module

**src/hello/.hello-package.jsonc**:
```jsonc
{
  "contributes": {
    "commands": [
      {
        "command": "vstoys.hello.greet",
        "category": "VsToys",
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

**src/hello/main.ts**:
```typescript
import * as vscode from "vscode";
import { createOutputChannel } from "../extension";

const ConfigSpace = "vstoys.hello";

let printOutput: (content: string, reveal?: boolean) => void;

export function activateHello(name: string, context: vscode.ExtensionContext) {
  printOutput = createOutputChannel(name);
  printOutput(`${name} activating`);

  context.subscriptions.push(
    vscode.commands.registerCommand("vstoys.hello.greet", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await editor.edit((edit) => {
          edit.insert(editor.selection.active, "Hello!");
        });
      }
    })
  );

  printOutput(`${name} activated`, false);
}
```

**Register in src/extension.ts**:
```typescript
import { activateHello } from "./hello/main";

const vsToys = [
  // ... existing modules
  {
    name: "Hello",
    moduleContext: "hello",
    activator: activateHello,
    deactivator: undefined
  }
];
```

Done! Now the module contributes a command and keybinding.
