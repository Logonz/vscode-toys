# Smart Open Scoring System

A flexible, extensible scoring system for ranking files in the smart-open feature. This system allows multiple scoring algorithms to be combined with configurable weights.

## Architecture

The scoring system consists of:

- **`IScorer`** - Interface that all scoring algorithms implement
- **`ScoreCalculator`** - Main engine that combines multiple scorers
- **`FileScore`** - Comprehensive score object with individual and final scores
- **Individual Scorers** - Specific scoring implementations

## Usage

### Basic Usage

```typescript
import { ScoreCalculator } from "./scoring";
import { UriExt } from "./picks/UriExt";

// Create a score calculator with default settings
const calculator = new ScoreCalculator();

// Calculate score for a single file
const score = calculator.calculateScore("search query", fileInfo);

// Calculate scores for multiple files
const scores = calculator.calculateScores("search query", files);
```

### Configuration

```typescript
import { ScoreCalculator, DEFAULT_SCORE_CONFIG } from "./scoring";

// Create custom configuration
const customConfig = {
  ...DEFAULT_SCORE_CONFIG,
  weights: {
    fuzzy: 1.0, // Primary scoring
    recency: 0.5, // Recently opened files
    frequency: 0.3, // Frequently accessed files
    length: 0.1, // Prefer shorter paths
    path: 0.2, // Path-based bonuses
  },
  enabled: {
    fuzzy: true,
    recency: true,
    frequency: true,
    length: false,
    path: true,
  },
};

const calculator = new ScoreCalculator(customConfig);
```

### Recording File Events

```typescript
// Record when files are opened (for recency/frequency tracking)
calculator.recordFileOpened(filePath);

// Access specific scorers for advanced usage
const recencyScorer = calculator.getScorer<RecencyScorer>("recency");
recencyScorer?.recordFileOpened(filePath);
```

## Built-in Scorers

### 1. FuzzyScorer (Always Enabled)

- Uses the fzy algorithm for fuzzy string matching
- Primary scoring mechanism
- Weight: 1.0

### 2. RecencyScorer (Disabled by default)

- Scores based on how recently files were opened
- Exponential decay over 24 hours
- Weight: 0.3

### 3. FrequencyScorer (Disabled by default)

- Scores based on how often files are accessed
- Logarithmic scaling to prevent dominance
- Weight: 0.2

### 4. LengthScorer (Disabled by default)

- Prefers shorter file paths
- Weight: 0.1

### 5. ClosenessScorer (Enabled by default)

- Scores based on path proximity to the currently active file
- Files in the same directory get higher scores
- Weight: 0.5

### 6. GitScorer (Disabled by default)

- Scores based on git co-change history
- Files that have been modified together with the current file get higher scores
- Uses git log analysis to find related files
- Weight: 0.4
- **Note**: Disabled by default due to potential performance impact

## Creating Custom Scorers

Implement the `IScorer` interface:

```typescript
import { IScorer } from "./IScorer";
import { UriExt } from "../picks/UriExt";

export class MyCustomScorer implements IScorer {
  readonly type = "custom";
  readonly name = "My Custom Scorer";
  readonly enabled = true;
  readonly defaultWeight = 0.2;

  calculateScore(input: string, file: UriExt): number {
    // Your scoring logic here
    return someScore;
  }
}
```

### Adding Custom Scorers

1. Create your scorer class implementing `IScorer`
2. Add it to the `ScoreCalculator` constructor
3. Update the configuration interfaces if needed
4. Add switch cases in the private methods

Example integration:

```typescript
// In ScoreCalculator.ts
private initializeScorers(): void {
  const scorers = [
    new FuzzyScorer(),
    new RecencyScorer(),
    new FrequencyScorer(),
    new LengthScorer(),
    new PathScorer(),
    new MyCustomScorer(), // Add your scorer here
  ];
  // ...
}
```

## FileScore Object

The `FileScore` interface contains:

```typescript
interface FileScore {
  // Individual score components
  fuzzyScore: number;
  recencyScore?: number;
  frequencyScore?: number;
  lengthScore?: number;
  pathScore?: number;

  // Final computed score (weighted combination)
  finalScore: number;

  // Metadata
  scoredAt: number; // timestamp
  input: string; // search query used
}
```

## Integration Example

```typescript
// In your file listing logic
import { getScoreCalculator } from "./fileListWithFuzzy";

const calculator = getScoreCalculator();

// Enable additional scorers
calculator.updateConfig({
  enabled: {
    ...calculator.getConfig().enabled,
    recency: true,
    frequency: true,
  },
});

// Files are automatically scored when using showFileListWithFuzzy
```

## Performance Considerations

- Scoring is done synchronously for all files
- Individual scorers should be lightweight
- Consider caching for expensive calculations
- The system processes ~1000 files efficiently

## Future Extensions

Potential new scorers:

- **SimilarityScorer** - Files similar to currently open files
- **ProjectScorer** - Files related to current project context
- **TimeScorer** - Files modified at similar times of day
- **CollaborationScorer** - Files often edited together by the same author

## Testing

Each scorer can be tested independently:

```typescript
const scorer = new FuzzyScorer();
const score = scorer.calculateScore("test", fileInfo);
```

The complete system can be tested with:

```typescript
const calculator = new ScoreCalculator();
const scores = calculator.calculateScores("query", files);
```
