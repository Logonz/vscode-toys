# VSToys Architecture Overview

## System-Level Design

VSToys is a collection of modular productivity utilities for VS Code. Each module operates independently but within a unified framework that handles registration, configuration, output channels, and context management.

### Why This Architecture?

The standard VS Code extension pattern has each feature scattered across package.json. VSToys reverses this: each module is self-contained, and its configuration is isolated in a JSONC file that gets automatically merged during build. This provides:

- **Modularity**: Each module is independent and can be understood in isolation
- **Scalability**: Adding new modules doesn't require editing the main package.json
- **Maintainability**: Related code and configuration live together
- **Organization**: Clear separation of concerns

## Build-Time Architecture: The JSONC Merge System

### The Problem It Solves

VS Code extensions define their capabilities in `package.json`. As projects grow, this file becomes massive and hard to maintain. Commands, keybindings, and configuration for different features are scattered across one huge file.

### The VSToys Solution: Webpack-Driven Merging

```
src/module-a/.module-a-package.jsonc  \
src/module-b/.module-b-package.jsonc  --- webpack merges all ---> package.json
src/module-c/.module-c-package.jsonc  /
```

**How it works** (in `webpack.config.js`):

```typescript
function mergePackageJSON() {
  // 1. Read main package.json
  let packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

  // 2. Clear out items that will be injected
  packageJson.contributes.commands = [];
  packageJson.contributes.configuration.properties = {};
  packageJson.contributes.keybindings = [];

  // 3. Find all *-package.jsonc files
  const injectFiles = sync("src/**/.*-package.jsonc");

  // 4. Deep merge each into package.json
  for (const file of injectFiles) {
    const injectContent = jsonc.parse(fs.readFileSync(file, "utf8"));
    packageJson = merge(packageJson, injectContent);
  }

  // 5. Write merged result
  fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2));
}
```

### Important Details

- **Timing**: Merging happens at the start of webpack build, before TypeScript compilation
- **File pattern**: Must be `.*-package.jsonc` (leading dot required!)
- **Location**: Files are found recursively under `src/`
- **Merge strategy**: Arrays are replaced (not appended), objects are deep merged
- **Result**: package.json on disk is temporarily modified but restored to version control version after build

## Runtime Architecture: Module Registration & Activation

### Module Registry

All modules are registered in `src/extension.ts`:

```typescript
const vsToys = [
  {
    name: "Copy Highlight",           // Display name for logging
    moduleContext: "copy-highlight",  // Namespace for config & context keys
    activator: activateCopyHighlight, // Function to call on activation
    deactivator: undefined            // Optional cleanup function
  },
  {
    name: "Registers",
    moduleContext: "registers",
    activator: activateRegisters,
    deactivator: undefined
  },
  // ... more modules
];
```

### Activation Flow

```
Extension loads (activationEvents: ["*"])
         ↓
src/extension.ts runs
         ↓
For each module in vsToys:
  ├─ Set context: vstoys.{moduleContext}.active = true
  ├─ Create output channel: {moduleName}
  ├─ Call activate{ModuleName}(name, context)
  │   └─ Module registers commands, event listeners, etc.
  └─ Push disposables to context.subscriptions
```

### Context Keys

Each module sets an identifying context that enables/disables its keybindings:

```typescript
// In extension.ts
await vscode.commands.executeCommand(
  "setContext",
  `vstoys.${module.moduleContext}.active`,
  true
);

// In keybindings (package.json)
{
  "command": "vstoys.copy-highlight.copy",
  "key": "ctrl+c",
  "when": "editorTextFocus && vstoys.copy-highlight.active"
}
```

## Configuration Architecture: Namespacing & Organization

### Configuration Hierarchy

```
vstoys                                    (global enable/disable)
├── vstoys.copy-highlight                (module namespace)
│   ├── enabled
│   ├── backgroundColor
│   ├── foregroundColor
│   └── timeout
├── vstoys.registers                     (another module)
│   ├── enabled
│   ├── maxPreviewLength
│   └── showEmptyRegisters
└── [other modules...]
```

### Settings in JSONC Files

Define all module settings in the `.module-name-package.jsonc` file:

```jsonc
{
  "contributes": {
    "configuration": {
      "properties": {
        "vstoys.copy-highlight.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable the Copy Highlight module",
          "order": 2000
        },
        "vstoys.copy-highlight.backgroundColor": {
          "type": "string",
          "default": "editor.wordHighlightBackground",
          "description": "Background color for highlight",
          "order": 2001
        }
      }
    }
  }
}
```

### Reading Configuration in Code

```typescript
const config = vscode.workspace.getConfiguration("vstoys.copy-highlight");
const backgroundColor = config.get("backgroundColor");
const timeout = config.get("timeout");

// Listen for changes
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("vstoys.copy-highlight.backgroundColor")) {
      // Re-read and apply new value
    }
  })
);
```

## Module Structure Deep Dive

### Standard Module Layout

```
src/module-name/
├── main.ts                           # Primary entry point
│   └── export activateModuleName()
├── .module-name-package.jsonc        # Configuration injection
├── [supporting files]
│   ├── helpers.ts
│   ├── types.ts
│   └── subfeature.ts
└── [subdirectories]
    └── shared/                       # Shared with other modules
```

### Activation Function Pattern

Every module exports a function following this pattern:

```typescript
export function activate{ModuleName}(name: string, context: vscode.ExtensionContext) {
  // 1. Setup logging
  const print = createOutputChannel(name);
  print(`${name} activating`);

  // 2. Read configuration
  const config = vscode.workspace.getConfiguration(`vstoys.${moduleContext}`);
  let setting = config.get("settingName");

  // 3. Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("vstoys.module.command", async () => {
      // Implementation
    })
  );

  // 4. Register event listeners
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`vstoys.${moduleContext}`)) {
        // Re-read settings
      }
    })
  );

  // 5. Register other disposables (decorations, etc.)
  context.subscriptions.push(/* ... */);

  // 6. Log completion
  print(`${name} activated`);
}
```

### Output Channel Pattern

VS Code output channels provide logging/debugging output visible to users:

```typescript
import { createOutputChannel } from "../extension";

export function activateMyModule(name: string, context: vscode.ExtensionContext) {
  const print = createOutputChannel(name);

  // Output channels are reusable
  print("Something happened");
  print("Debug info", true); // true = reveal the channel
}
```

The `createOutputChannel` helper creates namespaced output channels for each module.

## Feature Contribution Architecture

### Commands

```jsonc
"commands": [
  {
    "command": "vstoys.module.action",
    "category": "VsToys",
    "title": "Module: Action Description"
  }
]
```

Registered in code:
```typescript
vscode.commands.registerCommand("vstoys.module.action", async () => {
  // Handler code
});
```

### Keybindings

```jsonc
"keybindings": [
  {
    "command": "vstoys.module.action",
    "key": "ctrl+shift+x",
    "when": "editorTextFocus && vstoys.module.active"
  }
]
```

Conditions can combine:
- `editorTextFocus` - Only when editing text
- `vstoys.module.active` - Only when module is enabled
- `vstoys.module.someContext` - Custom contexts set by the module
- `!someContext` - Negation

### Configuration Properties

```jsonc
"configuration": {
  "properties": {
    "vstoys.module.enabled": {
      "type": "boolean",
      "default": true,
      "description": "...",
      "order": 2000
    }
  }
}
```

All types are standard JSON Schema types: `boolean`, `string`, `number`, `array`, `object`

## Shared Systems

### Helper Functions

Located in `src/helpers/` and imported by modules:

```typescript
import { pickColorType } from "../helpers/pickColorType";
import { createOutputChannel } from "../extension";
```

### Decoration Management

VS Code decorations render visual effects in the editor. Modules create and dispose decorations as needed:

```typescript
const decorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: someColor,
  color: someTextColor,
});

editor.setDecorations(decorationType, ranges);

// Later:
decorationType.dispose();
```

### Workspace Context

Many modules interact with the workspace, file system, or git:

```typescript
const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
const editor = vscode.window.activeTextEditor;
const document = editor?.document;
```

## Design Patterns Used

### 1. Module Isolation

Each module manages its own state, configuration, and disposables. No direct cross-module communication (modules don't import each other's main files).

### 2. Subscription Management

All long-lived resources (event listeners, commands, decorations) are pushed to `context.subscriptions` for automatic cleanup on extension deactivation.

### 3. Configuration Namespacing

Settings are strictly namespaced under `vstoys.{moduleContext}` to prevent conflicts and organize settings in UI.

### 4. Context Keys for Keybinding Conditions

Instead of global mode state, each module uses context keys that can be conditionally checked in keybindings.

### 5. Output Channels for Debugging

Each module has its own output channel for logging, making it easy to debug which module has an issue.

## Extension Lifecycle

```
VS Code launches
  ↓
Extension activates (activationEvents: ["*"])
  ↓
src/extension.ts:activate() runs
  ↓
For each module: call activator function
  ↓
All modules running simultaneously
  ↓
User interacts (keybindings, commands)
  ↓
Module event handlers / command handlers execute
  ↓
VS Code closes or extension is disabled
  ↓
All subscriptions are disposed (cleanup)
```

## Key Files

- **`src/extension.ts`**: Main entry point, module registration
- **`webpack.config.js`**: Contains the JSONC merging logic
- **`package.json`**: Base configuration (will be merged during build)
- **`src/module-name/.module-name-package.jsonc`**: Per-module contributions
- **`src/module-name/main.ts`**: Module implementation
