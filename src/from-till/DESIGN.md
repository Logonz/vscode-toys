# From-Till: Till Forward / Backward Design Outline

## General

- `.<module-name>-package.jsonc` defines contributions.
- Module imported and registered in `src/extension.ts`.
-

### Initialize file (main)

- `main.ts` exports an activation function.
- Commands/events added to `context.subscriptions`.
- Each command should look for "deactivateAllHyper" in args and if it is true execute `vscode.commands.executeCommand("vstoys.hyper.deactivateAll");`
- Keep it short, activate, deactivate, print<module>Output

### Helper file(s) (fade, configuration, etc.)

- Contains the fade logic keep it simple and separated.

### Logic file(s) (decorations, type/input handling, matching)

- Do not one giant file try and keep logic separated but do not create micro-files either.

## Entry: `Find/Till (Forward & Backward)` Commands

- Ensure no existing from-till session is active; tear it down without jumping back to origin.
- Set context `vstoys.from-till.awaitingChar = true`
- Enable a temporary character-capture mode by setting the awaiting context and overriding the `type` command.
- Provide an escape hatch: allow users to press `Escape` to cancel capture by wiring a command that is only active while the awaiting context is set.

## Character Capture Behaviour

- The override intercepts the very next typed character.
- When a printable character arrives, resolve the capture promise, dispose the override, and clear the awaitingChar context.
- On cancellation, restore the default `type` handler and exit quietly.
- onDidChangeTextEditorSelection/onDidChangeActiveTextEditor/onDidChangeWindowState all cancel the capture.

## Mode Initialisation After Capture

-
- Set context `vstoys.from-till.jumpActive = true`
- Collect candidate matches from the character immediately after the caret to the end of the document (forward/backward scan).
- Short-circuit with a status message if no targets exist.
- Seed a new mode state object with:
  - `origin`: capture the starting selection so cancellation can snap back.
  - `pendingPosition`: initialised to `origin`; tracks where the caret _would_ land on accept.
  - `select`: flag indicating whether an eventual accept should extend the selection from `origin` to `pendingPosition` instead of moving the caret alone.
  - `matches`: ordered list of positions; start at index `0`.
  - `direction`: 1/-1 (forward/backward); `kind`: find or till.
- Dim the active direction by applying fade decorations from the origin line to EOF.
- Switch on the active context (`vstoys.from-till.jumpActive = true`) and register runtime listeners (type override, editor/window/document change guards).

## Highlight Pass

- Determine the target coordinate for the current match:
  - **Find** (`f/F` semantics) "including" - lands _on_ the matched character.
  - **Till** (`t/T` semantics) "until not including" - lands one position short of the match when scanning backward, and directly on the match when scanning forward (mirroring Vim’s behavior where the operator applies up to—but not including—the target when traveling right).
- Only update `pendingPosition`; do not move the selection yet.
- Rebuild decoration options so each match shows its glyph via the `before` overlay, using per-range `contentText`.

## Input Handling While Active

- `type` override rules:
  - Pressing `Enter` should invoke an `accept` command that commits the pending position.
  - Typing the tracked character advances the index, recomputes `pendingPosition`, and refreshes decorations.
  - Any other input should terminate the mode, then forward the key to VS Code.
- onDidChangeTextEditorSelection/onDidChangeActiveTextEditor/onDidChangeWindowState all cancel the capture.
- Keep the caret stationary until `accept` fires; only the highlights and internal state update.

## Repeat Commands

- When the mode is active, `repeat`/`repeatReverse` should adjust the match index by ±1 and refresh `pendingPosition` plus decorations.
- Allows the end user to bind any key to go forwards/backwards in the possible matches.
- When the mode is inactive, the command does nothing.

## Accept & Cancel Paths

- `accept` moves the selection to `pendingPosition`, recentres the editor as needed, and calls the common teardown routine.
- `cancelMode` should restore the original `origin` selection, clear fade + match decorations, and drop the jumpActive context.
- `stopMode` must dispose all listeners, reset jumpActive/awaitingChar keys, and ensure both decoration layers are empty regardless of exit path.

## Input Capture Details

- Override `type` via `registerCommand("type", handler)` to intercept character input. Only raw characters (single glyph strings) or the newline sequence (`"\n"` / `"\r"`) should be harvested here.
- Modifier-driven keys (Escape, Tab, arrow keys, etc.) do **not** surface as printable characters in the `type` override. Expose dedicated commands for these keys and bind them behind the relevant contexts (e.g., `awaitingChar`, `jumpActive`) so the user can cancel/accept while the override is active.

## Decoration Notes

- Overlay matches using the `before` decoration slot with CSS `textDecoration: "none;position:absolute;z-index:999999;max-height:100%;"` so rendered glyphs sit above the editor text without shifting layout.
- Set `before.contentText` to the actual target character for each match, with the current match using a distinct decoration definition (different background/border) to communicate focus.

## Fade Overlay - Helper

- Maintain a cached `TextEditorDecorationType` per editor via a `WeakMap` so the same translucent styling is reused across sessions.
- The decoration uses a semi-transparent white (`#FFFFFF55`) applied as a simple foreground `color`, giving a washed-out effect without requiring range splits.
- `fade(editor, ranges)` sets whole-line ranges in the active direction; `unfade(editor)` clears them by reapplying an empty array.

## Configuration Knobs

- `highlightBackground` (`string`, default `"activityErrorBadge.background"`): base color applied to all non-current matches; accepts theme color IDs or hex values.
- `highlightForeground` (`string`, default `"button.foreground"`): text color for the overlay glyphs during navigation; optional—omit to inherit the theme.
- `highlightCurrentBackground` (`string`, default `"activityBarBadge.background"`): accent color for the active match to distinguish it from the rest.
- `fadeDuringJump` (`boolean`, default `true`): toggles the directional fade overlay while a jump session is active.

## JSONC Contribution Fragment

- Each module ships a hidden `.<module>-package.jsonc` fragment. webpack merges these into the root `package.json` during the build, so add commands, keybindings, and settings here rather than touching the root manifest.
- Commands should follow the namespace pattern `vstoys.<module>.<action>` and declare category/title metadata for the command palette.
- Use context keys in `when` clauses to keep keybindings scoped: e.g. `awaitingChar` for capture, `jumpActive` for the active jump loop, or the global `vstoys.from-till.active` for module-level shortcuts.
- Configuration properties live under `contributes.configuration.properties` with fully-qualified IDs (e.g. `vstoys.from-till.highlightBackground`), TypeScript-friendly types, defaults, and descriptions.
