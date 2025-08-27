# Hyper Module

The Hyper module provides a powerful layer-based keyboard override system for VS Code, similar to Neovim's modal editing concept. It allows you to temporarily activate "layers" that change keyboard behavior, enabling complex keybinding workflows and command sequences.

## Overview

The Hyper module implements a modal keyboard system where you can:
- Activate temporary keyboard layers that override normal typing behavior
- Execute commands when layers are activated
- Have layers automatically timeout after a configurable duration
- Chain multiple layers together for complex workflows
- Use visual feedback in the status bar to show active layers and remaining time

Think of it like Neovim's normal mode - when you activate a hyper layer, your keyboard switches from typing text to executing commands based on key presses.

## Core Components

### 1. ActionContext (`action.ts`)
The `ActionContext` class manages individual layer instances with the following features:

- **Timeout Management**: Each layer has a configurable timeout (default 6 seconds)
- **Status Bar Integration**: Shows active layer name and countdown timer
- **Command Execution**: Can execute VS Code commands when activated
- **Lifecycle Management**: Handles activation, deactivation, and cleanup

Key methods:
- `activate(command)`: Activates the layer and optionally executes a command
- `deactivate()`: Deactivates the layer and cleans up resources
- `IsActive()`: Returns whether the layer is currently active

### 2. Layer Management (`layer.ts`)
Manages multiple layer contexts and global state:

- **Global Context**: Tracks when any layer is active (`vstoys.hyper.global`)
- **Layer Tracking**: Maintains a map of all active layer contexts
- **Layer Types**: Supports both "normal" and "switch" layers
- **Deactivation**: Provides commands to deactivate individual or all layers

Layer types:
- **Normal Layers**: Can coexist with other active layers
- **Switch Layers**: Deactivate all other layers when activated (exclusive mode)

### 3. Configuration & Registration (`settings.ts`)
Handles dynamic registration of layers from VS Code settings:

- **Dynamic Registration**: Registers/unregisters commands based on configuration changes
- **Duplicate Detection**: Prevents conflicts from duplicate layer names
- **Command Generation**: Creates activate/deactivate commands for each configured layer
- **Live Updates**: Responds to configuration changes without requiring restart

### 4. Types (`types.ts`)
Defines TypeScript interfaces for type safety:

```typescript
interface HyperLayer {
  name: string;        // Unique layer identifier
  timeout?: number;    // Timeout in seconds (default: 6)
  enabled?: boolean;   // Whether layer is enabled (default: true)
}
```

## Configuration

The module is configured through VS Code settings:

### Basic Settings

```json
{
  "vstoys.hyper.enabled": true,  // Enable/disable the entire module
}
```

### Normal Layers
Layers that can coexist with other active layers:

```json
{
  "vstoys.hyper.normalLayers": [
    {
      "name": "hyper-layer",
      "timeout": 6,
      "enabled": true
    }
  ]
}
```

### Switch Layers
Exclusive layers that deactivate all others when activated:

```json
{
  "vstoys.hyper.switchLayers": [
    {
      "name": "commit-layer",
      "timeout": 900,  // 15 minutes for longer workflows
      "enabled": true
    }
  ]
}
```

## Generated Commands

For each configured layer, the module automatically generates VS Code commands:

### Normal Layers
- `vstoys.hyper.layerActivate.{layerName}` - Activates the layer
- `vstoys.hyper.layerDeactivate.{layerName}` - Deactivates the layer

### Switch Layers
- `vstoys.hyper.layerSwitch.{layerName}` - Switches to the layer (deactivating others)
- `vstoys.hyper.layerDeactivate.{layerName}` - Deactivates the layer

### Global Commands
- `vstoys.hyper.deactivateAll` - Deactivates all active layers

## Keybinding Integration

The module works seamlessly with VS Code's keybinding system using context conditions:

### Example Keybindings

```json
{
  // Activate hyper layer with Caps Lock (requires programmable keyboard)
  "command": "vstoys.hyper.layerActivate.hyper-layer",
  "key": "shift+f20",
  "when": "vstoys.hyper.active"
},
{
  // Git pull when 'p' is pressed in hyper layer
  "command": "git.pull",
  "key": "p",
  "when": "hyper-layer" // This context is set when layer is active
},
{
  // Global escape to exit all layers
  "command": "vstoys.hyper.deactivateAll",
  "key": "escape",
  "when": "vstoys.hyper.global"
}
```

### Context Conditions

The module sets these VS Code contexts when layers are active:

- `vstoys.hyper.global` - True when ANY layer is active
- `vstoys.hyper.active` - General hyper module state
- `{layerName}` - True when specific layer is active (e.g., `hyper-layer`)

## Usage Workflow

### Basic Workflow
1. **Activate Layer**: Press your configured activation key (e.g., Caps Lock)
2. **Status Feedback**: Status bar shows "░ hyper-layer ░ 5.2" (layer name + countdown)
3. **Execute Commands**: Press keys that trigger commands instead of typing
4. **Auto Timeout**: Layer automatically deactivates after timeout period
5. **Manual Exit**: Press Escape to immediately exit all layers

### Advanced Workflows

**Chained Operations**:
```
Caps Lock → p (git pull) → Caps Lock → s (git status) → Caps Lock → c (commit)
```

**Switch Layer Example**:
```
Activate commit-layer → Multiple commit-related commands → Auto-timeout after 15min
```

## Example Use Cases

### Git Workflow
```json
// In keybindings.json
[
  {
    "command": "vstoys.hyper.layerActivate.hyper-layer",
    "key": "shift+f20", // Caps Lock
    "when": "vstoys.hyper.active"
  },
  {
    "command": "git.pull",
    "key": "p",
    "when": "hyper-layer"
  },
  {
    "command": "git.push",
    "key": "shift+p",
    "when": "hyper-layer"
  },
  {
    "command": "git.status",
    "key": "s",
    "when": "hyper-layer"
  }
]
```

### File Navigation
```json
[
  {
    "command": "workbench.action.quickOpen",
    "key": "f",
    "when": "hyper-layer"
  },
  {
    "command": "workbench.action.showCommands",
    "key": "space",
    "when": "hyper-layer"
  }
]
```

### Terminal Operations
```json
[
  {
    "command": "workbench.action.terminal.toggleTerminal",
    "key": "t",
    "when": "hyper-layer"
  },
  {
    "command": "workbench.action.terminal.new",
    "key": "shift+t",
    "when": "hyper-layer"
  }
]
```

## Technical Details

### Status Bar Integration
- Shows active layer name in status bar with visual indicators
- Real-time countdown showing remaining timeout
- Updates every 50ms for smooth countdown animation
- Automatically disposed when layer deactivates

### Memory Management
- Proper cleanup of timeouts and status bar items
- Automatic disposal of VS Code command registrations
- No memory leaks from repeated activation/deactivation

### Error Handling
- Validates layer names (minimum 2 characters)
- Prevents registration of duplicate layer names
- Graceful handling of configuration errors
- User-friendly error messages

## Benefits

1. **Modal Editing**: Brings Neovim-like modal editing concepts to VS Code
2. **Reduced Cognitive Load**: Single-key commands instead of complex chord combinations
3. **Contextual Workflows**: Different layers for different contexts (git, navigation, etc.)
4. **Visual Feedback**: Clear indication of active mode and remaining time
5. **Flexible Configuration**: Easy to customize layers and timeouts
6. **Safety**: Automatic timeout prevents getting "stuck" in a layer

## Integration with VS Code Toys

The Hyper module integrates seamlessly with other VS Code Toys modules by:
- Using the shared output channel system for logging
- Following the same configuration patterns
- Leveraging VS Code's command and context system
- Providing a foundation for other modal-style interactions

This makes it a powerful base layer for implementing complex keyboard-driven workflows in VS Code.
