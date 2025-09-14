import * as vscode from "vscode";
import { IContextScorer, ScoringContext } from "../interface/IContextScorer";
import { UriExt } from "../../picks/interface/IUriExt";

/**
 * ClosenessScorer - gives higher scores to files that are "close" to the currently active editor
 * This is based on path similarity and common directory structures
 */
export class ClosenessScorer implements IContextScorer {
  readonly type = "closeness";
  readonly name = "Path Closeness";
  readonly enabled = false; // Disabled by default
  readonly defaultWeight = 0.25;
  readonly requiresContext = true; // This scorer needs access to active editor
  readonly context?: vscode.ExtensionContext;

  constructor(context?: vscode.ExtensionContext) {
    this.context = context;
  }

  calculateScore(input: string, file: UriExt, context?: ScoringContext): number {
    if (!context?.activeEditor) {
      return 0; // Can't calculate closeness without active editor
    }

    const activeEditorUri = context.activeEditor.document.uri;
    const activeEditorPath = vscode.workspace.asRelativePath(activeEditorUri);
    const activeEditorPathParts = activeEditorPath.split("/").filter((part) => part.length > 0);

    // Calculate the close score based on path overlap with the active editor
    let closeScore = 0;
    const fileParts = file.relativePath.split("/").filter((part) => part.length > 0);
    const commonParts = fileParts.filter((part) => activeEditorPathParts.includes(part));
    const uncommonParts = fileParts.filter((part) => !activeEditorPathParts.includes(part));

    // Base score: common parts minus uncommon parts
    // closeScore = Math.max(0, commonParts.length - uncommonParts.length);
    closeScore = Math.max(0, commonParts.length);
    // Additional bonuses for specific types of closeness

    // // 1. Same directory bonus
    // const activeDir = activeEditorPathParts.slice(0, -1).join("/");
    // const fileDir = fileParts.slice(0, -1).join("/");
    // if (activeDir === fileDir && activeDir.length > 0) {
    //   closeScore += 10; // Strong bonus for same directory
    // }

    // // 2. Parent/child directory relationships
    // if (activeDir.startsWith(fileDir) || fileDir.startsWith(activeDir)) {
    //   closeScore += 5; // Bonus for parent/child relationship
    // }

    // 3. Same file extension bonus
    const activeExt = this.getFileExtension(activeEditorPath);
    const fileExt = this.getFileExtension(file.relativePath);
    if (activeExt && fileExt && activeExt === fileExt) {
      closeScore += 3; // Bonus for same file type
    }

    // 4. Similar naming patterns
    const activeFileName = this.getFileName(activeEditorPath);
    const fileName = this.getFileName(file.relativePath);
    if (this.haveSimilarNames(activeFileName, fileName)) {
      closeScore += 5; // Bonus for similar file names
    }

    // // 5. Distance penalty - files further away in the directory tree get penalized
    // const pathDistance = this.calculatePathDistance(activeEditorPathParts, fileParts);
    // closeScore = Math.max(0, closeScore - pathDistance * 0.5);

    // If we are the same file reduce the score to 50%
    if (closeScore > 0 && activeEditorPath === file.relativePath) {
      closeScore = closeScore * 0.5;
    }

    return closeScore;
  }

  /**
   * Get file extension from path
   */
  private getFileExtension(path: string): string | null {
    const lastDot = path.lastIndexOf(".");
    const lastSlash = path.lastIndexOf("/");

    if (lastDot > lastSlash && lastDot > 0) {
      return path.substring(lastDot);
    }
    return null;
  }

  /**
   * Get filename without extension from path
   */
  private getFileName(path: string): string {
    const parts = path.split("/");
    const fileName = parts[parts.length - 1];
    const lastDot = fileName.lastIndexOf(".");

    if (lastDot > 0) {
      return fileName.substring(0, lastDot);
    }
    return fileName;
  }

  /**
   * Check if two filenames have similar patterns
   */
  private haveSimilarNames(name1: string, name2: string): boolean {
    // Convert to lowercase for comparison
    const n1 = name1.toLowerCase();
    const n2 = name2.toLowerCase();

    // Exact match
    if (n1 === n2) return true;

    // One contains the other
    if (n1.includes(n2) || n2.includes(n1)) return true;

    // Similar patterns (e.g., "userService" and "user-service")
    const normalized1 = n1.replace(/[-_]/g, "");
    const normalized2 = n2.replace(/[-_]/g, "");
    if (normalized1 === normalized2) return true;

    // Check for common prefixes/suffixes
    if (n1.length > 3 && n2.length > 3) {
      const prefix1 = n1.substring(0, Math.min(4, n1.length));
      const prefix2 = n2.substring(0, Math.min(4, n2.length));
      if (prefix1 === prefix2) return true;
    }

    return false;
  }

  // /**
  //  * Calculate "distance" between two paths in the directory tree
  //  */
  // private calculatePathDistance(pathParts1: string[], pathParts2: string[]): number {
  //   // Find common prefix length
  //   let commonPrefixLength = 0;
  //   const minLength = Math.min(pathParts1.length, pathParts2.length);

  //   for (let i = 0; i < minLength; i++) {
  //     if (pathParts1[i] === pathParts2[i]) {
  //       commonPrefixLength++;
  //     } else {
  //       break;
  //     }
  //   }

  //   // Distance is the sum of unique parts after the common prefix
  //   const distance1 = pathParts1.length - commonPrefixLength;
  //   const distance2 = pathParts2.length - commonPrefixLength;

  //   return distance1 + distance2;
  // }
}
