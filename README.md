# VsToys - Visual Studio Code Utilities

**VsToys** is a collection of utilities designed to enhance your productivity in Visual Studio Code. It provides multiple features, including customizable keybindings for single and double actions, smarter file navigation, Git enhancements, and more. With VsToys, you can streamline repetitive tasks, boost efficiency, and make working with your codebase smoother.

## Key Features

### Double Action
- **Single Press Command**: Executes a configurable command when the key is pressed once.
- **Double Press Command**: Executes a different command if the key is pressed twice within a threshold time (double-press).
- **Pre Double Press Command**: Optionally execute a command before the double press command (e.g., to exit from a previous state or clear the selection).
- **Timeout Mode**: Control the behavior of the single press. When enabled, the single press waits for the double press threshold to pass before executing, ensuring no double press has occurred.

### Dot Repeat
- **Repeat Last Action**: Execute repeated actions based on a previous command, making it easier to repeat selections or movements.
- **Timeout for Actions**: Actions will timeout after a set period unless triggered, giving you the flexibility to chain or exit commands.

### Smart Open
- **Fuzzy Search**: Quickly find and open files in your workspace based on a smart fuzzy search algorithm.
- **Customizable Labels**: Use custom patterns to define how files should be labeled in search results, allowing for easier file identification.
- **Quick Navigation**: Jump to frequently accessed files, leveraging metadata like recency and frequency.

### Git Enhancements
- **Stage File**: Easily stage files from your current working directory.
- **Stage Hunk**: Stage individual hunks at the current selection point, offering fine-grained control over staging.

## Commands

| Command                                | Description                                                            | Default Keybinding |
|----------------------------------------|------------------------------------------------------------------------|--------------------|
| `vstoys.double-action.execute`         | Execute single or double press actions based on timing.                 | `f21`              |
| `vstoys.dot-repeat.repeatExecute`      | Execute a repeated action, useful for actions like expand selections.   | `alt+a`            |
| `vstoys.dot-repeat.repeatExit`         | Exit repeat mode and deactivate contexts.                               | `escape`           |
| `vstoys.smart-open.openSmart`          | Smart fuzzy search for quickly opening files in your workspace.         | *Not assigned*     |
| `vstoys.git.stageFile`                 | Stage the current file in Git.                                          | *Not assigned*     |
| `vstoys.git.stageHunk`                 | Stage the current hunk at the current selection point in Git.           | *Not assigned*     |

## Configuration Options

This extension exposes several configuration options under the `vstoys` namespace:

### Double Action Settings
| Setting                                     | Type    | Default                                   | Description |
|---------------------------------------------|---------|-------------------------------------------|-------------|
| `double-action.timeoutPress`                | boolean | `false`                                   | Wait for double press before executing single press command. |
| `double-action.singlePressCommand`          | string  | `findJump.activate`                       | Command to execute on single key press. |
| `double-action.preDoublePressCommand`       | string  | `findJump.activateWithSelection`          | Command to execute before double press, useful for clearing states. |
| `double-action.doublePressCommand`          | string  | `findJump.activateWithSelection`          | Command to execute on double key press. |
| `double-action.doublePressThreshold`        | number  | 800                                       | Time window (ms) for detecting a double press. |

### Smart Open Settings
| Setting                             | Type    | Default         | Description |
|-------------------------------------|---------|-----------------|-------------|
| `vstoys.smart-open.enabled`         | boolean | `true`          | Enable Smart Open feature. |

### Dot Repeat Settings
| Setting                             | Type    | Default         | Description |
|-------------------------------------|---------|-----------------|-------------|
| `vstoys.dot-repeat.enabled`         | boolean | `true`          | Enable Dot Repeat feature. |

## Timeout Mode (Double Action)

By setting `double-action.timeoutPress` to `true`, you can enable **timeout mode**, where the single press command only executes after confirming no double press has occurred. This prevents the single press action from triggering before the time threshold for double press has passed.

## Installation

You can install VsToys from the VSCode marketplace or by manually installing a `.vsix` package:
```bash
code --install-extension vscode-toys.vsix
```

## Contribution

Contributions to VsToys are welcome! If you have ideas, improvements, or bug reports, feel free to open an issue or submit a pull request on [GitHub](https://github.com/Logonz/vscode-toys/issues).

## Development

To develop VsToys locally:

1. Clone the repository.
2. Install dependencies using `npm install`.
3. Use `npm run watch` to watch for changes and recompile automatically.

## License

VsToys is licensed under the MIT License. See [LICENSE](https://github.com/Logonz/vscode-toys/blob/main/LICENSE) for more details.
