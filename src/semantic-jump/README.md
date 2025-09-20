# Semantic Jump - Flash.nvim-Inspired Navigation

A Flash.nvim-inspired semantic token navigation system for VSCode that provides intelligent character assignment based on target density and importance.

## Features

### 🎯 **Adaptive Character Assignment**
- **Low Density** (≤15 targets): All single characters
- **Medium Density** (16-40): Mix of single chars for high-priority + two-char sequences
- **High Density** (>40): Progressive two-character sequences

### 🧠 **Smart Token Clustering**
- Groups related tokens (e.g., `obj.prop.method()`)
- Shows only the most important token in each cluster
- Reduces visual noise from chained property access

### 🏠 **Character Set Management**
- Uses `jumpCharacters` setting as single source of truth
- Smart slicing: first 8 chars = home row, remainder = extended
- Configurable for different keyboard layouts and preferences

### 🎨 **Visual Conflict Avoidance**
- Detects when jump chars would conflict with surrounding code
- Automatically uses uppercase alternatives
- Maintains visual clarity in all scenarios

## Configuration

### **Core Settings**

```json
{
  // Jump mode selection
  "vstoys.semantic-jump.mode": "adaptive",  // "simple" | "adaptive" | "progressive"

  // Character customization
  "vstoys.semantic-jump.jumpCharacters": "fjdkslaghrueiwoncmvFJDKSLAGHRUEIWONCMV",

  // Token filtering
  "vstoys.semantic-jump.includedTokenTypes": [
    "function", "method", "class", "interface", "type", "enum", "enumMember",
    "variable", "property", "parameter", "namespace", "typeParameter", "struct",
    "decorator", "event", "macro", "label"
  ],

  // Advanced features
  "vstoys.semantic-jump.clusteringEnabled": true,
  "vstoys.semantic-jump.includeAllTokenTypes": false
}
```

### **Token Priorities** (Configurable!)

```json
{
  "vstoys.semantic-jump.tokenPriorities": {
    "function": 100,    // Highest priority
    "method": 100,
    "class": 90,
    "interface": 85,
    "type": 80,
    "enum": 75,
    "decorator": 70,
    "namespace": 65,
    "variable": 50,
    "property": 40,
    "parameter": 30,
    "enumMember": 25,
    "event": 20,
    "macro": 15,
    "label": 10         // Lowest priority
    // Add custom token types here!
  }
}
```

### **Density Thresholds**

```json
{
  "vstoys.semantic-jump.densityThresholds": {
    "lowToMedium": 15,   // Single-char → Mixed mode
    "mediumToHigh": 40   // Mixed → Progressive mode
  }
}
```

## Usage Examples

### **Low Density Scenario**
```typescript
function example() {
  const data = getData();
  processData(data);
}
```
**Experience**: Press `f` → jump to function, `d` → jump to getData, etc.

### **Medium Density Scenario**
```typescript
class UserService {
  private api: ApiClient;
  private cache: Map<string, User>;

  async getUser(id: string): Promise<User> {
    const cached = this.cache.get(id);
    if (cached) return cached;

    const user = await this.api.fetchUser(id);
    this.cache.set(id, user);
    return user;
  }
}
```
**Experience**:
- High-priority tokens get single chars: `c` → class, `f` → function, `a` → api
- Lower-priority tokens get sequences: `gh` → cache, `ru` → cached, etc.

### **High Density Scenario**
```typescript
// Complex file with 50+ semantic tokens
const result = api.users.profile.settings.notifications.email.preferences.unsubscribe.marketing.campaigns;
```
**Experience**: All targets use two-character sequences, intelligently clustered to show only meaningful jump points.

## Adding Custom Token Types

To support a new language or token type, simply extend the configuration:

```json
{
  "vstoys.semantic-jump.tokenPriorities": {
    // Default priorities...
    "customTokenType": 85,       // Add missing token type
    "languageSpecific": 60,      // Language-specific token
    "frameworkSpecific": 45      // Framework-specific token
  }
}
```

No code changes required! The system will automatically:
1. Include your custom tokens in filtering
2. Assign appropriate priority scores
3. Generate jump characters accordingly

## Commands

- **`vstoys.semantic-jump.jump`** - Start adaptive jump mode
- **`vstoys.semantic-jump.debug`** - Debug mode (shows ALL tokens with red X markers)
- **`vstoys.semantic-jump.escape`** - Cancel/escape (bound to ESC key when active)

## Modes Comparison

| Mode | Character Usage | Best For |
|------|----------------|----------|
| **Simple** | Fixed assignment from `jumpCharacters` | Small files, predictable behavior |
| **Adaptive** | Smart density-based assignment | All scenarios (recommended) |
| **Progressive** | Always two-character sequences | Very dense files, consistent UX |

## Technical Architecture

### **AdaptiveCharAssigner**
- Core intelligence for character assignment
- Handles clustering, scoring, and conflict avoidance
- Fully configurable through VSCode settings

### **ProgressiveJumpInput**
- Two-phase input handling
- Supports both single-char and sequence jumps
- Real-time refinement and visual feedback

### **SemanticJumpHandler**
- Orchestrates the entire jump process
- Integrates with VSCode's semantic token API
- Manages decorations and user interaction

## Benefits Over Traditional Jump Systems

1. **Context Aware**: Understands semantic meaning, not just visual patterns
2. **Language Agnostic**: Works with any language that provides semantic tokens
3. **Density Adaptive**: Automatically adjusts strategy based on content complexity
4. **Highly Configurable**: Users can customize for their specific needs
5. **Conflict Free**: Avoids visual confusion with surrounding code
6. **Extensible**: Easy to add support for new languages/frameworks

## Future Enhancements

- **Learning System**: Remember frequently accessed targets
- **Multi-Cursor Support**: Handle multiple cursors simultaneously
- **Custom Clustering Rules**: User-defined clustering logic
- **Performance Optimization**: Lazy evaluation for very large files
- **Integration**: Deep integration with other VSCode Toys modules

---

*This implementation brings the intelligence and elegance of Flash.nvim to VSCode's rich semantic understanding, creating a powerful and intuitive navigation experience.*