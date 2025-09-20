// Quick test for the refactored pickColorType function
// Note: This is a simple Node.js test, not a full VS Code test

// Mock vscode.ThemeColor for testing
class MockThemeColor {
  constructor(id) {
    this.id = id;
  }
}

// Simple version of the function for testing (without VS Code imports)
function isHexColor(color) {
  const cleanColor = color.startsWith("#") ? color.slice(1) : color;

  if (!/^[0-9a-fA-F]+$/.test(cleanColor)) {
    return false;
  }

  const validLengths = [3, 4, 6, 8];
  return validLengths.includes(cleanColor.length);
}

function pickColorType(inputColor) {
  const trimmedColor = inputColor.trim();

  if (isHexColor(trimmedColor)) {
    return inputColor; // Return original string for hex colors
  }

  return new MockThemeColor(inputColor); // Return ThemeColor for theme IDs
}

// Test cases
const testCases = [
  // Hex colors (should return original string)
  "#fff",
  "#ffffff",
  "#ffff",
  "#ffffffff",
  "fff",
  "ffffff",
  "FFF",
  "FFFFFF",
  "#123456",
  "#abc",

  // Theme colors (should return ThemeColor)
  "editor.background",
  "errorForeground",
  "editor.foreground.secondary",
  "statusBar.background.active.debug",
  "some.deeply.nested.theme.color",

  // Invalid hex (should be treated as theme colors)
  "#gggggg",
  "#ff",
  "#fffffffff",
  "notahex",
  "editor.123invalid",
];

console.log("Testing pickColorType function:");
console.log("================================");

testCases.forEach((testCase) => {
  const result = pickColorType(testCase);
  const isThemeColor = result instanceof MockThemeColor;
  const resultType = isThemeColor ? "ThemeColor" : "String";
  const resultValue = isThemeColor ? result.id : result;

  console.log(`Input: "${testCase}" -> ${resultType}("${resultValue}")`);
});
