/**
 * A lightweight glob matcher for basic patterns used in custom editor labels
 * This replaces minimatch for simple use cases to reduce bundle size
 */

/**
 * Convert a glob pattern to a RegExp
 */
function globToRegExp(pattern: string): RegExp {
  let regexStr = "";
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    switch (char) {
      case "*":
        if (pattern[i + 1] === "*") {
          // Handle **
          if (pattern[i + 2] === "/") {
            // **/ matches zero or more directories
            regexStr += "(?:.*/)?";
            i += 3;
          } else if (i + 1 === pattern.length - 1) {
            // ** at end matches everything
            regexStr += ".*";
            i += 2;
          } else {
            // ** in middle, treat as *
            regexStr += "[^/]*";
            i += 2;
          }
        } else {
          // Single * matches anything except /
          regexStr += "[^/]*";
          i++;
        }
        break;

      case "?":
        // ? matches any single character except /
        regexStr += "[^/]";
        i++;
        break;

      case "[":
        // Character class
        let j = i + 1;
        if (j < pattern.length && pattern[j] === "!") {
          j++; // Skip negation
        }
        if (j < pattern.length && pattern[j] === "]") {
          j++; // Skip literal ]
        }
        while (j < pattern.length && pattern[j] !== "]") {
          j++;
        }
        if (j >= pattern.length) {
          // No closing ], treat [ as literal
          regexStr += "\\[";
          i++;
        } else {
          // Valid character class
          let charClass = pattern.slice(i, j + 1);
          if (charClass.startsWith("[!")) {
            charClass = "[^" + charClass.slice(2);
          }
          regexStr += charClass;
          i = j + 1;
        }
        break;

      case "{":
        // Brace expansion - simplified version
        let braceEnd = i + 1;
        let braceDepth = 1;
        while (braceEnd < pattern.length && braceDepth > 0) {
          if (pattern[braceEnd] === "{") braceDepth++;
          if (pattern[braceEnd] === "}") braceDepth--;
          braceEnd++;
        }

        if (braceDepth === 0) {
          const braceContent = pattern.slice(i + 1, braceEnd - 1);
          const alternatives = braceContent.split(",");
          regexStr += "(?:" + alternatives.map((alt) => alt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")";
          i = braceEnd;
        } else {
          // No matching }, treat as literal
          regexStr += "\\{";
          i++;
        }
        break;

      // Escape special regex characters
      case ".":
      case "+":
      case "^":
      case "$":
      case "(":
      case ")":
      case "|":
      case "\\":
        regexStr += "\\" + char;
        i++;
        break;

      default:
        regexStr += char;
        i++;
        break;
    }
  }

  return new RegExp("^" + regexStr + "$");
}

/**
 * Simple glob matcher - matches a path against a glob pattern
 * @param path The file path to test
 * @param pattern The glob pattern
 * @returns true if the path matches the pattern
 */
export function simpleMatch(path: string, pattern: string): boolean {
  try {
    const regex = globToRegExp(pattern);
    return regex.test(path);
  } catch (error) {
    // If regex compilation fails, fall back to literal string comparison
    return path === pattern;
  }
}

/**
 * Test if a pattern contains glob special characters
 */
export function hasGlobChars(pattern: string): boolean {
  return /[*?[\]{}]/.test(pattern);
}
