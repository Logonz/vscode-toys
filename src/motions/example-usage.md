# Motion Input Examples

## New Format (di + count + text object)

### Before (neovim style):

```
User input sequence: 3 → d → i → (
Status bar shows: "3" → "3d" → "3di" → executes
Result: Delete inside 3rd level of parentheses
```

### After (new format):

```
Command: vstoys.motions.di (bound to .di)
User input sequence: 3 → (
Status bar shows: "di" → "di3" → executes
Result: Delete inside 3rd level of parentheses
```

## Example Flows

### 1. Simple delete inside parentheses

- Trigger: `.di` (bound to vstoys.motions.di)
- Type: `(`
- Status: "di" → executes `di(`
- Result: Deletes content inside current parentheses

### 2. Delete inside 3rd level of parentheses

- Trigger: `.di`
- Type: `3(`
- Status: "di" → "di3" → executes `di3(`
- Result: Deletes content inside 3rd outer level of parentheses

### 3. Yank around 2nd level quotes

- Trigger: `.ya` (bound to vstoys.motions.ya)
- Type: `2"`
- Status: "ya" → "ya2" → executes `ya2"`
- Result: Yanks content + quotes from 2nd outer level

### 4. Automatic text object selection

- Trigger: `.di` (bound to vstoys.motions.di)
- Type: `i`
- Status: "di" → executes `dii`
- Result: Deletes content inside closest text object (any type)

### 5. Delete 2nd closest text object

- Trigger: `.di`
- Type: `2i`
- Status: "di" → "di2" → executes `di2i`
- Result: Deletes content inside 2nd closest text object
- Example: In `("hello")` with cursor on `h`, deletes `("hello")`

### 6. Interactive mode (unchanged)

- Trigger: `vstoys.motions.start`
- Type: `2di(`
- Status: "Motion: " → "Motion: 2" → "Motion: 2d" → "Motion: 2di" → executes
- Result: Same as neovim style, builds complete motion

### 7. Interactive mode with automatic text objects

- Trigger: `vstoys.motions.start`
- Type: `3daa`
- Status: "Motion: " → "Motion: 3" → "Motion: 3d" → "Motion: 3da" → executes
- Result: Delete around 3rd closest text object

## Automatic Text Object Examples

The `i` and `a` characters work as "automatic" text objects that find the closest delimiters:

### Example String: `("hello")`

With cursor positioned on `h`:

- `dia` → deletes `hello` (quotes are closest to cursor)
- `2dii` → deletes `("hello")` (parentheses are 2nd closest)
- `vaa` → selects `"hello"` (including quotes)
- `2vaa` → selects `("hello")` (including parentheses)

### Complex Example: `{foo: ["bar", 'baz']}`

With cursor on `b` in `bar`:

- `dia` → deletes `bar` (quotes closest)
- `2dii` → deletes `"bar", 'baz'` (brackets 2nd closest)
- `3dii` → deletes `foo: ["bar", 'baz']` (braces 3rd closest)

## Benefits

1. **Direct binding**: Can bind `.di`, `.da`, etc. to specific commands
2. **Intuitive flow**: Operation first, then count, then target
3. **Consistent**: All direct commands follow same pattern
4. **Backward compatible**: Interactive mode still supports neovim style
5. **Automatic selection**: `i`/`a` characters find closest text objects without specifying type
6. **Smart proximity**: Automatically detects and ranks text objects by distance to cursor
