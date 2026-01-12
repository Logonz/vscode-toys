# Using the ClosenessScorer

The ClosenessScorer gives higher scores to files that are "close" to the currently active editor based on path similarity and common directory structures.

## How to Enable

```typescript
import { getScoreCalculator } from "./fileListWithFuzzy";

const calculator = getScoreCalculator();

// Enable closeness scoring
calculator.updateConfig({
  enabled: {
    ...calculator.getConfig().enabled,
    closeness: true,
  },
});
```

## How it Works

The ClosenessScorer analyzes:

1. **Common path parts** - Files with shared directory components get higher scores
2. **Same directory bonus** - Files in the same directory as the active file get a strong bonus
3. **Parent/child relationships** - Files in parent or child directories get bonuses
4. **File extension matching** - Files with the same extension as the active file get bonuses
5. **Similar naming patterns** - Files with similar names get bonuses
6. **Path distance penalty** - Files further away in the directory tree get penalized

## Example Scoring

If you have an active file: `src/components/UserProfile.tsx`

And these files in your workspace:

- `src/components/UserSettings.tsx` - **High score** (same directory, same extension, similar name)
- `src/components/Avatar.tsx` - **Medium score** (same directory, same extension)
- `src/utils/userHelpers.ts` - **Low score** (different directory, different extension, but "user" in name)
- `test/UserProfile.test.tsx` - **Medium score** (similar name, same extension, but different directory)
- `README.md` - **Very low score** (completely different)

## Configuration

The default weight is `0.25` but you can adjust it:

```typescript
calculator.updateConfig({
  weights: {
    ...calculator.getConfig().weights,
    closeness: 0.5, // Increase weight to make closeness more important
  },
});
```

## Implementation Details

The scorer calculates:

```typescript
closeScore = Math.max(0, commonParts.length - uncommonParts.length);
```

Plus additional bonuses:

- Same directory: +10
- Parent/child relationship: +5
- Same file extension: +3
- Similar file names: +5
- Path distance penalty: -0.5 per distance unit
