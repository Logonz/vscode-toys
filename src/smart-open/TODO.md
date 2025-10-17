# TODO

- [x] [1] Image file icons doesn't load such as filetype `.png`, my guess is that we need to map filetypes like `.png` to the svg for the general type of `image`
- [x] [1] Font file icons doesn't load such as filetype `.ttf`, my guess is that we need to map filetypes like `.ttf` to the svg for the general type of `font`
- [x] [5] The RecencyScorer uses time rather than "intervals" or something else, for example FrequencyScorer uses access triggers to clean up the freqscorer
- [ ] [8] Make is so that GetAllFilesInWorkspace returns only the current workspace or all, but not in the same list... stupid
- [ ] [8] Should we do the fuzzy search on the entire relative path or just the filename?
      [src/smart-open/scoring/Scorers/FuzzyScorer.ts](scoring/Scorers/FuzzyScorer.ts)
      [src/smart-open/picks/fileListWithFuzzy.ts](picks/fileListWithFuzzy.ts)
