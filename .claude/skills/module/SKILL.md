---
name: module
description: Create or modify modules for this VS Code extension. Use when you see "create module", "new module", "add module", "modify module", "module template", "scaffold module". Provides templates from assets/templates/blank-module/ and handles JSONC package merging into package.json.
---

# Module Creation & Modification

**Quick start**: Copy `assets/templates/blank-module/` to create a new module in seconds.

## What this skill does

Creates and modifies modules for this VS Code extension. Handles:
- Scaffolding from template
- JSONC package merging
- Extension registration in `src/extension.ts`
- Command/keybinding setup

## When Claude should use this

Trigger keywords in user requests:
- "create a module" / "create module"
- "new module"
- "add a module" / "add module"
- "modify module" / "update module"
- "module template"
- "scaffold module"

## The Module Pattern

This extension uses a **modular activation pattern** where each module:
1. Lives in its own `src/module-name/` directory
2. Exports an `activate{ModuleName}` function
3. Has a `.module-name-package.jsonc` file with its configuration/commands/keybindings
4. Gets registered in `src/extension.ts` in the main `vsToys` array
5. Gets automatically merged into `package.json` during webpack build

## The JSONC Injection System

The webpack build process automatically merges all `*-package.jsonc` files from `src/` into the main `package.json`:

**In `webpack.config.js`:**
```javascript
// Finds all files matching pattern: src/**/.*-package.jsonc
const injectFiles = sync("src/**/.*-package.jsonc");

// Deep merges each file into package.json
for (const file of injectFiles) {
  const injectContent = jsonc.parse(fs.readFileSync(file, "utf8"));
  packageJson = merge(packageJson, injectContent);
}
```

**Result**: You define module features in isolated JSONC files, and they automatically appear in the final package.json during build.

## References

Refer to the following documents for detailed information:

- **`references/architecture.md`** - Complete overview of the module system, activation patterns, and extension lifecycle
- **`references/module-structure.md`** - Detailed breakdown of directory layout, file organization, and module anatomy
- **`references/jsonc-reference.md`** - Complete JSONC schema with all possible contribution types
- **`references/quick-patterns.md`** - Common patterns for adding commands, keybindings, settings, and event handlers

## Creating a New Module: High-Level Steps

1. **Create directory**: `src/your-module-name/`
2. **Copy template files** from `assets/templates/blank-module/` to your new module directory
3. **Rename files**:
   - `.blank-module-package.jsonc` → `.your-module-name-package.jsonc`
   - `blank-module-main.ts` → `your-module-name-main.ts`
4. **Update function name**: `activateBlankModule` → `activateYourModuleName`
5. **Register module**: Add to `src/extension.ts` in the `vsToys` array
6. **Build and test**: Run `npm run compile` to trigger JSONC merging

The blank-module template in `assets/templates/blank-module/` provides all the boilerplate you need—just copy it and customize!

## Key Architecture Principles

### Module Registration Pattern

All modules register via `src/extension.ts`:

```typescript
const vsToys = [
  {
    name: "Copy Highlight",           // Display name
    moduleContext: "copy-highlight",  // Used for config namespace & context keys
    activator: activateCopyHighlight, // Function that runs on activate
    deactivator: undefined            // Optional cleanup
  },
  // ... more modules
];
```

### Configuration Namespacing

Settings are automatically namespaced under `vstoys.{moduleContext}.{setting}`:

```jsonc
"vstoys.copy-highlight.enabled": { /* ... */ },
"vstoys.copy-highlight.backgroundColor": { /* ... */ }
```

### Context Keys

Each module can set VS Code context keys for conditional keybindings:

```typescript
// Sets context: vstoys.copy-highlight.active
vscode.commands.executeCommand("setContext", "vstoys.copy-highlight.active", true);
```

### Output Channels

Each module gets its own output channel via the shared `createOutputChannel` helper:

```typescript
import { createOutputChannel } from "../extension";

export function activateCopyHighlight(name: string, context: vscode.ExtensionContext) {
  const print = createOutputChannel(name);
  print("Module activating...");
}
```

## Common Tasks

### Adding a Command with Keybinding

1. Add to `.module-name-package.jsonc`:
   ```jsonc
   "contributes": {
     "commands": [
       {
         "command": "vstoys.module.commandName",
         "category": "VsToys",
         "title": "Module: Command Title"
       }
     ],
     "keybindings": [
       {
         "command": "vstoys.module.commandName",
         "key": "ctrl+shift+x",
         "when": "editorTextFocus && vstoys.module.active"
       }
     ]
   }
   ```

2. Register in `main.ts`:
   ```typescript
   context.subscriptions.push(
     vscode.commands.registerCommand("vstoys.module.commandName", async () => {
       // Implementation
     })
   );
   ```

### Adding a Configuration Setting

Add to `.module-name-package.jsonc`:
```jsonc
"vstoys.module.settingName": {
  "type": "string",
  "default": "defaultValue",
  "description": "What this setting does",
  "order": 2000
}
```

Read in `main.ts`:
```typescript
const config = vscode.workspace.getConfiguration("vstoys.module");
const value = config.get("settingName");
```

### Handling Configuration Changes

```typescript
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("vstoys.module.settingName")) {
      // Re-read and apply new settings
    }
  })
);
```

## Module Lifecycle

1. **Extension activates** (triggered by VS Code)
2. **`src/extension.ts` loads** and calls each module's `activate` function
3. **Module registers disposables**: commands, event listeners, decorations
4. **Context keys set**: `vstoys.{module-context}.active` is set to true
5. **Module runs** based on keybindings, commands, and event handlers
6. **Extension deactivates**: (cleanup currently not fully used)

## Getting Started Quickly

Use the `assets/templates/blank-module/` as your starting point. It includes:
- Properly structured JSONC file with comments explaining each section
- Main TypeScript file with the activation pattern already set up
- Placeholder comments showing where to add commands, event listeners, and configuration reading

Copy these files, customize them for your module, and you're ready to implement!

## Webpack Build Process

When you run `npm run compile`:

1. Webpack loads `webpack.config.js`
2. `mergePackageJSON()` function runs immediately
3. Finds all `*-package.jsonc` files under `src/`
4. Parses each as JSON with comments (via `jsonc` library)
5. Deep merges all into the main `package.json` in memory
6. Writes merged `package.json` back to disk
7. Proceeds with normal webpack compilation

**Important**: The `package.json` is temporarily modified during build but should remain in version control with only the "base" configuration (no merged contributions).

## Tips & Gotchas

- **JSONC file naming**: Must follow pattern `.*-package.jsonc` (leading dot!)
- **Deep merging**: Arrays are replaced, not concatenated (use order property for UI ordering)
- **Context keys**: Set via `setContext("vstoys.module.context", boolean)`
- **Disposables**: Always push to `context.subscriptions` for proper cleanup
- **Configuration access**: Use `vscode.workspace.getConfiguration("vstoys.module")`
- **Keybinding conditions**: Combine module context + editor focus + custom conditions

## File Structure Reference

```
src/
├── extension.ts              # Main entry, module registration
├── module-name/
│   ├── main.ts              # Module implementation (exports activateModuleName)
│   ├── .module-name-package.jsonc  # Configuration, commands, keybindings
│   └── [other supporting files]
└── [other modules...]
```

## Next Steps

1. **Read** `references/architecture.md` for deep understanding
2. **Review** `references/jsonc-reference.md` for all available options
3. **Check** `assets/examples/copy-highlight-annotated/` for a real working example
4. **Use** `references/quick-patterns.md` for specific implementation patterns
