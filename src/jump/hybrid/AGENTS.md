# Hybrid Jump - AI Agent Context Document

## Purpose & Design Philosophy

Hybrid Jump is a **progressive pattern-matching navigation system** for VS Code that combines:
1. **Incremental search** - Type characters to progressively filter matches
2. **Smart jump targets** - Automatically assigns jump characters when matches are manageable
3. **Pattern continuation** - In jump mode, typing valid pattern characters continues the search instead of jumping

This creates a fluid navigation experience where users can seamlessly transition between "searching" and "jumping" without explicit mode changes.

## Architecture Overview

### Core Components

```
HybridJumpHandler (hybridJumpHandler.ts)
  ├─> ProgressiveSearchInput (progressiveHyperInput.ts)
  │     ├─> HybridMatchFinder (hybridJump.ts)
  │     └─> HybridJumpAssigner (hybridJump.ts)
  └─> JumpDecorationManager (../shared/jumpDecorationManager.ts)
```

### Component Responsibilities

1. **HybridJumpHandler** - Orchestrator
   - Entry point for user commands
   - Manages lifecycle (start, cancel, cleanup)
   - Coordinates decorations and status bar
   - Handles navigation commands (next/prev match, backspace, enter)

2. **ProgressiveSearchInput** - State Machine
   - Manages search state (pattern, matches, mode)
   - Handles keyboard input capture
   - Implements state transitions (search ↔ jump mode)
   - Decides when to continue pattern vs jump

3. **HybridMatchFinder** - Pattern Matching
   - Extends BaseMatchFinder
   - Finds all pattern matches in visible ranges
   - Creates HybridMatch objects with context (fullWord, nextChar)
   - Sorts by distance from cursor
   - Filters by configuration (maxMatches, minWordLength)

4. **HybridJumpAssigner** - Jump Character Assignment
   - Uses AdaptiveCharAssigner for intelligent char assignment
   - **Critical**: Handles excluded characters (pattern continuation chars)
   - **Critical**: Resolves assignment conflicts (duplicates, ambiguities)
   - Converts matches to LabeledMatch with jump chars

5. **JumpDecorationManager** - Visual Feedback
   - Renders primary/secondary match highlights
   - Displays jump character labels
   - Uses theme-aware colors

## State Machine & Flow

### States

```
INACTIVE
   ↓ (user activates)
SEARCH MODE
   ├─> pattern building (type chars)
   ├─> matches updating (real-time)
   └─> [transition check]
         ↓ (meets criteria)
JUMP MODE
   ├─> single-char jump (immediate)
   ├─> sequence jump (wait for 2nd char)
   └─> pattern continuation (if char is valid next char)
         ↓ (back to SEARCH MODE)
```

### Transition Conditions (Search → Jump Mode)

Located in: `progressiveHyperInput.ts::shouldTransitionToJumpMode()`

**ALL** conditions must be met:
1. `pattern.length >= minPatternLength` (default: 3)
2. `matches.length <= maxMatchesForAutoJump` (default: 30)
3. `matches.length > 0` (at least one match)
4. `hasNoAvailableJumpChars() === false` (some jump chars available)

**Why these criteria:**
- Too short pattern → too many matches, overwhelming
- Too many matches → can't assign unique jump chars effectively
- No matches → nothing to jump to
- No available chars → all chars needed for pattern continuation

### Input Handling in Jump Mode

Located in: `progressiveHyperInput.ts::handleJumpModeInput()`

**Decision tree when user types character `c`:**

```
1. Check: Is `c` a valid pattern continuation character?
   ├─> YES and pattern+c yields matches
   │     └─> CONTINUE PATTERN (switch back to search mode)
   └─> NO
         ↓
2. Check: Is `c` a single-character jump assignment?
   ├─> YES
   │     └─> JUMP IMMEDIATELY
   └─> NO
         ↓
3. Check: Does `c` start any sequence assignments?
   ├─> YES, multiple sequences
   │     └─> WAIT FOR SECOND CHAR
   ├─> YES, exactly one sequence
   │     └─> JUMP IMMEDIATELY (optimization)
   └─> NO
         └─> IGNORE (no matching assignment)
```

**Critical Design Decision:**
Single-char jumps are checked BEFORE sequences. This means if 'j' is a single-char jump, it will ALWAYS jump immediately, never starting a sequence. This is why conflict resolution is critical (see below).

## Pattern Continuation System

### How It Works

**Excluded Characters:**
When entering jump mode, the system identifies all "next possible characters" from current matches:

```typescript
// For pattern "activate" with matches:
// - "activateHyper"  → nextChar = 'h'
// - "activateGit"    → nextChar = 'g'
// - "activateClear"  → nextChar = 'c'

excludedChars = Set(['h', 'g', 'c'])
```

These excluded characters are passed to `HybridJumpAssigner` to avoid using them as jump characters.

**Why:**
- Allows natural typing continuation
- User can type "activateh" instead of memorizing jump codes
- Seamless experience between search and jump modes

### Pattern Continuation Check

Located in: `progressiveHyperInput.ts::shouldContinuePattern()`

```typescript
private shouldContinuePattern(char: string): boolean {
  // 1. Is char a possible next character?
  const nextChars = this.getNextPossibleCharacters();
  if (!nextChars.has(char.toLowerCase())) {
    return false;
  }

  // 2. Would continuing actually yield matches?
  const testPattern = this.searchState.pattern + char;
  const matches = this.matchFinder.findMatches(testPattern, ...);
  
  return matches.length > 0;
}
```

**Design rationale:**
- Check 1: Quick filter - no point continuing if char isn't possible
- Check 2: Validation - ensure continuation is productive
- Both checks prevent dead-end pattern extensions

## Jump Character Assignment & Conflict Resolution

### The Core Challenge

Jump character assignment must satisfy these constraints:
1. **No duplicates** - Each target needs unique jump char(s)
2. **No excluded chars** - Don't use pattern continuation chars
3. **No ambiguity** - A character can't be both a complete jump AND start of sequence

### Assignment Flow

Located in: `hybridJump.ts::HybridJumpAssigner`

```
1. Convert HybridMatch → DecodedToken (for AdaptiveCharAssigner)
2. Call AdaptiveCharAssigner.assignChars()
   └─> Returns initial assignments (may have conflicts)
3. Post-process with reassignConflictingChars()
   └─> TWO-PHASE conflict resolution
4. Convert JumpAssignment → HybridLabeledMatch
```

### Two-Phase Conflict Resolution

Located in: `hybridJump.ts::reassignConflictingChars()`

**Critical method - handles all conflict types**

#### Phase 1: Excluded Character Conflicts

**Problem:** Initial assignments may use excluded characters

**Solution:**
```typescript
// Find conflicts
assignments.forEach((assignment, index) => {
  if (assignment.chars[0] in excludedChars) {
    conflictingAssignments.push(index);
  }
});

// Reassign using only available (non-excluded) characters
for (conflicting in conflictingAssignments) {
  assignment = getNextAvailableChar(notInExcluded, notInUsed);
}
```

#### Phase 2: Single-Char vs Sequence Ambiguity

**Problem:** A char like 'j' might be BOTH:
- A complete single-char jump (immediate)
- The first char of sequences "jf", "jd" (wait for 2nd char)

**Why this is critical:**
Input handler checks single-char matches FIRST (line 183 in progressiveHyperInput.ts):
```typescript
const singleCharMatch = matches.find(m => !m.isSequence && m.jumpChar === char);
if (singleCharMatch) {
  performJump(singleCharMatch); // ALWAYS jumps, never waits
  return;
}
```

This means sequences starting with 'j' are UNREACHABLE if 'j' is also a single-char jump.

**Solution:**
```typescript
// Build map of all sequence first characters
const sequenceFirstChars = new Set();
assignments.forEach(a => {
  if (a.isSequence) {
    sequenceFirstChars.add(a.chars[0]);
  }
});

// Find single-char assignments that conflict
const conflicts = assignments.filter(a => 
  !a.isSequence && sequenceFirstChars.has(a.chars)
);

// Reassign single-chars to characters NOT used as sequence starters
for (conflict in conflicts) {
  assignment = getCharNotInSequenceFirstChars();
}
```

**Result:** Every character has exactly one meaning - no ambiguity.

### Tracking Used Characters

Critical for preventing duplicates:

```typescript
const usedChars = new Set<string>();

// Track non-conflicting assignments
if (!hasConflict) {
  usedChars.add(assignment.chars.toLowerCase());
}

// When reassigning, only use unused characters
const unusedChars = availableChars.filter(c => !usedChars.has(c));

// After assigning, mark as used
usedChars.add(newAssignment.chars.toLowerCase());
```

## Data Structures

### HybridMatch
```typescript
interface HybridMatch extends BaseMatch {
  position: vscode.Position;
  text: string;           // Matched text
  pattern: string;        // Search pattern
  line: number;
  startChar: number;
  endChar: number;
  fullWord?: string;      // Complete word containing match
  nextChar?: string;      // Character after match (for continuation)
}
```

**Why fullWord and nextChar:**
- `fullWord`: Provides context for better classification
- `nextChar`: Enables pattern continuation detection

### HybridLabeledMatch
```typescript
interface HybridLabeledMatch extends HybridMatch {
  jumpChar: string;       // Assigned jump character(s)
  isSequence: boolean;    // True if 2+ chars, false if single char
}
```

### SearchState
```typescript
interface SearchState {
  pattern: string;              // Current search pattern
  matches: LabeledMatch[];      // Matches with jump chars
  currentMatchIndex: number;    // For next/prev navigation
  isInJumpMode: boolean;        // Search mode vs jump mode
  isWaitingForSecondChar: boolean;  // For sequence input
  firstChar: string;            // First char of sequence (if waiting)
}
```

## Configuration

All settings under `vstoys.hybrid-jump.*`:

| Setting | Default | Purpose |
|---------|---------|---------|
| `jumpCharacters` | "fjdksla..." | Characters available for jump assignment |
| `caseSensitive` | false | Pattern matching case sensitivity |
| `maxMatches` | 100 | Limit matches to prevent overwhelming display |
| `minWordLength` | 0 | Filter out short matches if > 0 |
| `minPatternLength` | 3 | Min pattern length before auto-entering jump mode |
| `maxMatchesForAutoJump` | 30 | Max matches to auto-enter jump mode |
| `autoJumpSingleMatch` | true | Auto-jump when only one match remains |
| Color settings | various | Theme-aware decoration colors |

## Common Edge Cases & Handling

### Edge Case 1: No Available Characters
**Scenario:** All jump chars are excluded (pattern continuation)  
**Handling:** Don't enter jump mode (`hasNoAvailableJumpChars()` prevents transition)

### Edge Case 2: More Matches Than Available Chars
**Scenario:** 50 matches but only 20 available single chars  
**Handling:** Use two-character sequences (via AdaptiveCharAssigner density logic)

### Edge Case 3: Empty Pattern After Backspace
**Scenario:** User backspaces entire pattern  
**Handling:** Cancel hybrid jump mode entirely (line 442 in progressiveHyperInput.ts)

### Edge Case 4: Pattern Continuation Yields No Matches
**Scenario:** User types 'h' but "activateh" has no matches  
**Handling:** `shouldContinuePattern()` returns false, treats 'h' as jump char instead

### Edge Case 5: Single Match Remaining
**Scenario:** Pattern narrows to one match  
**Handling:** Auto-jump if `autoJumpSingleMatch` is enabled (optimization)

### Edge Case 6: Sequence with One Candidate
**Scenario:** User types 'j', only one sequence "jf" starts with 'j'  
**Handling:** Jump immediately without waiting for 'f' (optimization, line 195)

## Integration with Shared Infrastructure

### BaseMatchFinder
Hybrid inherits pattern matching logic:
- `findMatches()` - Searches visible ranges
- `sortByDistanceFromCursor()` - Prioritizes nearby matches
- `findFullWord()` - Extracts complete word for context

### AdaptiveCharAssigner
Provides density-aware character assignment:
- **Low density** (few targets): Single characters
- **Medium density**: Mix of single chars + sequences
- **High density** (many targets): All sequences
- Token clustering (optional)
- Visual conflict avoidance

### JumpDecorationManager
Shared decoration system:
- Primary match (current/first)
- Secondary matches
- Jump labels positioned after matches
- Theme-aware colors via `pickColorType()`

## Debugging & Troubleshooting

### Common Issues

**Issue:** "Characters getting duplicated"
- **Check:** `reassignConflictingChars()` usedChars tracking
- **Verify:** Phase 1 and Phase 2 both update usedChars

**Issue:** "Can't access sequence jumps"
- **Check:** Phase 2 conflict resolution
- **Verify:** Single-chars don't conflict with sequence first chars

**Issue:** "Excluded chars being used"
- **Check:** Phase 1 conflict resolution
- **Verify:** `getNextPossibleCharactersFromMatches()` extracting nextChar

**Issue:** "Jump mode not entering"
- **Check:** `shouldTransitionToJumpMode()` conditions
- **Verify:** Pattern length, match count, available chars

**Issue:** "Pattern continuation not working"
- **Check:** `shouldContinuePattern()` logic
- **Verify:** nextChar fields populated on HybridMatch
- **Verify:** Match finder extracts nextChar correctly

### Debug Logging Points

Add logging at these critical points:

```typescript
// In progressiveHyperInput.ts
console.log('Pattern:', pattern, 'Matches:', matches.length, 'Jump mode:', isInJumpMode);
console.log('Excluded chars:', Array.from(excludedChars));
console.log('Available chars after exclusion:', availableChars.size);

// In hybridJump.ts
console.log('Pre-reassignment:', assignments.map(a => a.chars));
console.log('Conflicting assignments (Phase 1):', conflictingAssignments);
console.log('Conflicting assignments (Phase 2):', singleVsSequenceConflicts);
console.log('Post-reassignment:', assignments.map(a => a.chars));
```

## Performance Considerations

### Optimization Strategies

1. **Visible ranges only** - Only search visible editor ranges, not entire document
2. **Early termination** - Stop searching if maxMatches reached
3. **Lazy decoration** - Only create decorations when needed
4. **Cached regex** - Pattern compilation cached where possible

### Potential Bottlenecks

1. **Many matches scenario** - 1000+ matches can slow down
   - **Mitigation:** maxMatches configuration
   - **Mitigation:** Encourage longer patterns before jump mode

2. **Complex conflict resolution** - O(n²) in worst case
   - **Mitigation:** Early exits when no conflicts
   - **Mitigation:** Limited by maxMatches

3. **Decoration rendering** - Many decorations = VS Code overhead
   - **Mitigation:** maxMatches limits decoration count
   - **Mitigation:** Clear decorations on state changes

## Testing Scenarios

### Essential Test Cases

1. **Basic flow**
   - Type pattern → enter jump mode → press jump char → jump

2. **Pattern continuation**
   - Type pattern → enter jump mode → type valid next char → stays in search

3. **Excluded char handling**
   - Pattern "activate" → verify 'h', 'g', 'c' not used as jump chars

4. **No duplicate assignments**
   - Verify all jump chars unique across all matches

5. **Single vs sequence conflict**
   - Verify no char is both single-char jump AND sequence starter

6. **Sequence jump**
   - Press first char → wait → press second char → jump

7. **Auto-jump single match**
   - Type until one match → verify auto-jump

8. **Backspace behavior**
   - In jump mode, backspace → return to search mode
   - In search mode, backspace → remove last char
   - Empty pattern, backspace → cancel

9. **Next/prev navigation**
   - Multiple matches → Tab cycles through → Enter jumps to current

10. **Cancel behavior**
    - ESC → cancel → decorations cleared → state reset

## Future Enhancement Opportunities

### Potential Improvements

1. **Learning system** - Remember frequently jumped targets, prioritize them
2. **Multi-cursor support** - Handle multiple cursors simultaneously
3. **Cross-file search** - Search across open files, not just current
4. **Fuzzy matching** - Allow typos/partial matches
5. **Context awareness** - Consider semantic context (inside function, class, etc.)
6. **Custom jump char pools** - Per-language or per-file-type configurations
7. **Jump history** - Track and allow quick return to previous positions
8. **Integration with marks** - Set marks at jump targets

### Architecture Considerations for Enhancements

- **Learning system**: Add persistence layer for jump statistics
- **Multi-cursor**: Batch operations, coordinate decoration managers
- **Cross-file**: Abstract document source, handle multi-editor state
- **Fuzzy matching**: Replace exact indexOf with fuzzy match algorithm
- **Context awareness**: Integrate with semantic token provider
- **Custom pools**: Extend configuration system with scope overrides

## Comparison with Other Jump Modes

### Regular Jump (../regular/)
- **Simpler**: No pattern continuation, pure jump mode
- **Use case**: Quick jumps with known targets
- **Hybrid advantage**: Progressive filtering for unknown targets

### Semantic Jump (../semantic/)
- **Token-based**: Jumps to semantic tokens (functions, classes, etc.)
- **Use case**: Structural navigation
- **Hybrid advantage**: Pattern-based, works with any text

### Hybrid Uniqueness
- **Best of both worlds**: Progressive search + smart jumping
- **Fluid transitions**: Seamless search ↔ jump mode changes
- **Pattern continuation**: Natural typing flow maintained
- **Context-aware**: Understands word boundaries and possible continuations

## Key Takeaways for AI Agents

1. **Two-phase conflict resolution is critical** - Don't skip Phase 2 or sequences become unreachable

2. **Pattern continuation is optional but powerful** - Excluded chars enable it, but system still works without

3. **State machine is well-defined** - Follow state transitions carefully when modifying

4. **Input handling order matters** - Single-char checks before sequences creates the ambiguity Phase 2 solves

5. **Shared infrastructure is robust** - Leverage BaseMatchFinder, AdaptiveCharAssigner, JumpDecorationManager

6. **Configuration is extensive** - Many behaviors tunable via settings

7. **Edge cases are handled** - Empty patterns, no matches, single matches, etc.

8. **Performance is bounded** - maxMatches prevents runaway scenarios

9. **Testing is essential** - Conflict resolution bugs are subtle and hard to spot

10. **User experience is paramount** - Every decision optimized for natural, fluid navigation

---

## File Reference Quick Guide

- `hybridJumpHandler.ts` - Orchestrator, entry point, lifecycle
- `progressiveHyperInput.ts` - State machine, input handling, mode transitions
- `hybridJump.ts` - Match finding, jump char assignment, conflict resolution
- `../shared/baseMatchFinder.ts` - Pattern matching base class
- `../shared/adaptiveCharAssigner.ts` - Intelligent char assignment
- `../shared/jumpDecorationManager.ts` - Visual feedback
- `../shared/types.ts` - Type definitions
- `../shared/functions.ts` - Utility functions

---

*This document represents the complete mental model of Hybrid Jump as of the latest implementation. Future modifications should preserve these architectural principles and conflict resolution guarantees.*
