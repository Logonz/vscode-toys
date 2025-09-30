import * as vscode from "vscode";

export type DecodedToken = {
  line: number;
  startChar: number;
  length: number;
  type: string;
  modifiers: string[];
  text?: string;
};

export type TokenCluster = {
  tokens: DecodedToken[];
  representative: DecodedToken; // The most important token in the cluster
  startLine: number;
  endLine: number;
  startChar: number;
  endChar: number;
};

export type ScoredTarget = {
  token: DecodedToken;
  score: number;
  clusterId?: number;
};

export type JumpAssignment = {
  token: DecodedToken;
  position: vscode.Position; // Position to jump to
  decorationPosition: vscode.Position; // Position to show decoration at
  chars: string; // Single char or multi-char sequence
  isSequence: boolean;
};

export type DensityLevel = "low" | "medium" | "high";

export type JumpTargetMode = "start" | "end";

type CharPools = {
  homeRow: string[];
  lowercase: string[];
  uppercase: string[];
  others: string[];
  all: string[];
};

export class AdaptiveCharAssigner {
  // Default values - will be overridden by configuration
  private readonly defaultTypeScores: Record<string, number> = {
    function: 100,
    method: 100,
    class: 90,
    interface: 85,
    type: 80,
    enum: 75,
    decorator: 70,
    namespace: 65,
    variable: 50,
    property: 40,
    parameter: 30,
    enumMember: 25,
    event: 20,
    macro: 15,
    label: 10,
  };

  private readonly defaultJumpChars = "fjdkslaghrueiwoncmvFJDKSLAGHRUEIWONCMV";

  /**
   * Main entry point - assigns jump characters to tokens using Flash.nvim-inspired algorithm
   */
  assignChars(
    tokens: DecodedToken[],
    cursorPosition: vscode.Position,
    document: vscode.TextDocument,
    configPrefix: string = "vstoys.semantic-jump",
    targetMode: JumpTargetMode = "start"
  ): JumpAssignment[] {
    // Get configuration
    const config = vscode.workspace.getConfiguration(configPrefix);

    // Step 1: Cluster related tokens (if enabled)
    const clusteringEnabled = config.get<boolean>("clusteringEnabled", true);
    const clusters = clusteringEnabled ? this.detectClusters(tokens) : [];

    // Step 2: Score and filter targets
    const scoredTargets = this.scoreTargets(tokens, clusters, cursorPosition, config);

    const jumpCharsSetting = config.get<string>("jumpCharacters", this.defaultJumpChars);
    const charPools = this.getCharPools(jumpCharsSetting);

    // Step 3: Calculate density and choose strategy
    const density = this.calculateDensity(scoredTargets.length, charPools, config);
    console.log(`AdaptiveCharAssigner: ${scoredTargets.length} targets, density=${density}`);

    // Step 4: Assign characters based on density
    let assignments = this.performAdaptiveAssignment(scoredTargets, density, charPools, targetMode);

    // Step 5: Avoid visual conflicts
    assignments = this.avoidVisualConflicts(assignments, document, jumpCharsSetting);

    return assignments;
  }
  // Partition the configured jump characters into reusable pools for each density tier
  private getCharPools(jumpChars: string): CharPools {
    const chars = jumpChars.split("").filter(Boolean);
    const addUnique = (list: string[], char: string) => {
      if (!list.includes(char)) {
        list.push(char);
      }
    };

    const homeRowLimit = Math.min(8, chars.length);
    const homeRow: string[] = [];
    for (let i = 0; i < homeRowLimit; i++) {
      addUnique(homeRow, chars[i]);
    }

    const lowercase: string[] = [];
    const uppercase: string[] = [];
    const others: string[] = [];

    chars.forEach((char) => {
      // Skip if already in home row
      if (!homeRow.includes(char)) {
        if (/[a-z]/.test(char)) {
          addUnique(lowercase, char);
        } else if (/[A-Z]/.test(char)) {
          addUnique(uppercase, char);
        } else {
          addUnique(others, char);
        }
      }
    });

    const all: string[] = [];
    chars.forEach((char) => addUnique(all, char));

    return { homeRow, lowercase, uppercase, others, all };
  }

  /**
   * Detect clusters of related tokens (e.g., chained property access)
   */
  private detectClusters(tokens: DecodedToken[]): TokenCluster[] {
    const clusters: TokenCluster[] = [];
    if (tokens.length === 0) return clusters;

    let currentCluster: DecodedToken[] = [tokens[0]];

    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];
      const prevToken = tokens[i - 1];

      if (this.shouldCluster(prevToken, token)) {
        currentCluster.push(token);
      } else {
        // Finalize current cluster
        if (currentCluster.length > 0) {
          clusters.push(this.createCluster(currentCluster));
        }
        currentCluster = [token];
      }
    }

    // Don't forget the last cluster
    if (currentCluster.length > 0) {
      clusters.push(this.createCluster(currentCluster));
    }

    return clusters;
  }

  /**
   * Determine if two tokens should be in the same cluster
   */
  private shouldCluster(token1: DecodedToken, token2: DecodedToken): boolean {
    // Same line check
    if (token1.line !== token2.line) return false;

    // Character proximity check (within 5 characters)
    const distance = token2.startChar - (token1.startChar + token1.length);
    if (distance > 5) return false;

    // Semantic relationship check
    const chainableTypes = ["variable", "property", "method", "namespace"];
    const type1Chainable = chainableTypes.includes(token1.type);
    const type2Chainable = chainableTypes.includes(token2.type);

    if (type1Chainable && type2Chainable) {
      // Check for dot notation pattern (e.g., obj.prop.method)
      if (distance === 1) {
        // Likely a dot between them
        return true;
      }
    }

    return false;
  }

  /**
   * Create a cluster from a group of tokens
   */
  private createCluster(tokens: DecodedToken[]): TokenCluster {
    // Find the most important token as representative
    const representative = tokens.reduce((best, token) => {
      const bestScore = this.defaultTypeScores[best.type] || 0;
      const tokenScore = this.defaultTypeScores[token.type] || 0;
      return tokenScore > bestScore ? token : best;
    });

    return {
      tokens,
      representative,
      startLine: tokens[0].line,
      endLine: tokens[tokens.length - 1].line,
      startChar: tokens[0].startChar,
      endChar: tokens[tokens.length - 1].startChar + tokens[tokens.length - 1].length,
    };
  }

  /**
   * Score targets based on importance and position
   */
  private scoreTargets(
    tokens: DecodedToken[],
    clusters: TokenCluster[],
    cursorPosition: vscode.Position,
    config: vscode.WorkspaceConfiguration
  ): ScoredTarget[] {
    const scoredTargets: ScoredTarget[] = [];
    const tokenToCluster = new Map<DecodedToken, number>();

    // Map tokens to their cluster IDs
    clusters.forEach((cluster, clusterId) => {
      cluster.tokens.forEach((token) => {
        tokenToCluster.set(token, clusterId);
      });
    });

    // Get configured token priorities
    const tokenPriorities = { ...this.defaultTypeScores, ...config.get<Record<string, number>>("tokenPriorities", {}) };

    // Score each token
    tokens.forEach((token) => {
      const clusterId = tokenToCluster.get(token);

      // Skip non-representative tokens in clusters
      if (clusterId !== undefined) {
        const cluster = clusters[clusterId];
        if (token !== cluster.representative && cluster.tokens.length > 1) {
          // Only include cluster representative unless it's a single-token cluster
          return;
        }
      }

      const typeScore = tokenPriorities[token.type] || 10;
      const distance = Math.abs(token.line - cursorPosition.line);
      const distancePenalty = Math.min(distance * 2, 50); // Cap penalty at 50

      // Bonus for tokens near cursor (within 5 lines)
      const proximityBonus = distance <= 5 ? 20 : 0;

      const score = typeScore - distancePenalty + proximityBonus;

      scoredTargets.push({
        token,
        score,
        clusterId,
      });
    });

    // Sort by score (highest first)
    return scoredTargets.sort((a, b) => b.score - a.score);
  }

  /**
   * Choose density mode by comparing target volume to the capacity each pool can comfortably label
   */
  private calculateDensity(
    targetCount: number,
    charPools: CharPools,
    config: vscode.WorkspaceConfiguration
  ): DensityLevel {
    const lowercasePool = charPools.lowercase.length > 0 ? charPools.lowercase : charPools.all;
    // Auto-calculate density thresholds based on available character tiers
    const lowCapacity = charPools.homeRow.length > 0 ? charPools.homeRow.length : lowercasePool.length;
    const mediumCapacity = lowCapacity + lowercasePool.length * Math.max(lowercasePool.length, 1);

    // Old manual density thresholds (commented out)
    // const manualThresholds = config.get<{ lowToMedium?: number; mediumToHigh?: number }>("densityThresholds");
    // const lowToMedium = manualThresholds?.lowToMedium ?? lowCapacity;
    // const mediumToHigh = manualThresholds?.mediumToHigh ?? mediumCapacity;

    const lowToMedium = lowCapacity;
    const mediumToHigh = mediumCapacity;
    console.log(`Density thresholds: lowToMedium=${lowToMedium}, mediumToHigh=${mediumToHigh}`);

    if (targetCount <= lowToMedium) return "low";
    if (targetCount <= mediumToHigh) return "medium";
    return "high";
  }

  /**
   * Dispatch to the assignment strategy that matches the current density tier
   */
  private performAdaptiveAssignment(
    targets: ScoredTarget[],
    density: DensityLevel,
    charPools: CharPools,
    targetMode: JumpTargetMode
  ): JumpAssignment[] {
    switch (density) {
      case "low":
        return this.assignSingleChars(targets, charPools, targetMode);
      case "medium":
        return this.assignMixedChars(targets, charPools, targetMode);
      case "high":
        return this.assignProgressiveChars(targets, charPools, targetMode);
    }
  }

  /**
   * Calculate the position to jump to based on the target mode
   */
  private calculateJumpPosition(token: DecodedToken, targetMode: JumpTargetMode): vscode.Position {
    const jumpChar = targetMode === "end" ? token.startChar + token.length : token.startChar;
    return new vscode.Position(token.line, jumpChar);
  }

  /**
   * Calculate the position for decoration display based on the target mode
   */
  private calculateDecorationPosition(token: DecodedToken, targetMode: JumpTargetMode): vscode.Position {
    const decorationChar = targetMode === "end" ? token.startChar + token.length - 1 : token.startChar;
    return new vscode.Position(token.line, decorationChar);
  }

  /**
   * Low density: stick to the most ergonomic single characters (home row first)
   */
  private assignSingleChars(
    targets: ScoredTarget[],
    charPools: CharPools,
    targetMode: JumpTargetMode
  ): JumpAssignment[] {
    const availableChars = charPools.homeRow.length > 0 ? charPools.homeRow : charPools.all;

    if (availableChars.length === 0) {
      return [];
    }

    return targets.slice(0, availableChars.length).map((target, i) => ({
      token: target.token,
      position: this.calculateJumpPosition(target.token, targetMode),
      decorationPosition: this.calculateDecorationPosition(target.token, targetMode),
      chars: availableChars[i],
      isSequence: false,
    }));
  }

  /**
   * Medium density: reserve single keys for top targets and build lowercase-first sequences for the rest
   */
  private assignMixedChars(
    targets: ScoredTarget[],
    charPools: CharPools,
    targetMode: JumpTargetMode
  ): JumpAssignment[] {
    const assignments: JumpAssignment[] = [];
    const singleChars = charPools.homeRow.length > 0 ? charPools.homeRow : charPools.all;
    const lowercasePool = charPools.lowercase.length > 0 ? charPools.lowercase : charPools.all;

    const singleCharCount = Math.min(singleChars.length, targets.length);

    targets.slice(0, singleCharCount).forEach((target, i) => {
      assignments.push({
        token: target.token,
        position: this.calculateJumpPosition(target.token, targetMode),
        decorationPosition: this.calculateDecorationPosition(target.token, targetMode),
        chars: singleChars[i],
        isSequence: false,
      });
    });

    // Remaining targets get two-char sequences
    const remaining = targets.slice(singleCharCount);
    if (remaining.length === 0 || lowercasePool.length === 0) {
      return assignments;
    }

    let index = 0;
    for (const firstChar of lowercasePool) {
      for (const secondChar of lowercasePool) {
        if (index >= remaining.length) {
          break;
        }

        const target = remaining[index];
        assignments.push({
          token: target.token,
          position: this.calculateJumpPosition(target.token, targetMode),
          decorationPosition: this.calculateDecorationPosition(target.token, targetMode),
          chars: firstChar + secondChar,
          isSequence: true,
        });

        index++;
      }
      if (index >= remaining.length) {
        break;
      }
    }

    return assignments;
  }

  /**
   * High density: widen both keystrokes to include every available character pool (lower, upper, symbols)
   */
  private assignProgressiveChars(
    targets: ScoredTarget[],
    charPools: CharPools,
    targetMode: JumpTargetMode
  ): JumpAssignment[] {
    const assignments: JumpAssignment[] = [];

    const mergeUnique = (...lists: string[][]): string[] => {
      const combined: string[] = [];
      lists.forEach((list) => {
        list.forEach((char) => {
          if (!combined.includes(char)) {
            combined.push(char);
          }
        });
      });
      return combined;
    };

    const lowercasePool = charPools.lowercase.length > 0 ? charPools.lowercase : charPools.all;
    const firstChars = mergeUnique(lowercasePool, charPools.uppercase, charPools.others);
    const secondChars = mergeUnique(lowercasePool, charPools.uppercase, charPools.others);

    if (firstChars.length === 0 || secondChars.length === 0) {
      return assignments;
    }

    let targetIndex = 0;

    for (const firstChar of firstChars) {
      for (const secondChar of secondChars) {
        if (targetIndex >= targets.length) {
          break;
        }

        assignments.push({
          token: targets[targetIndex].token,
          position: this.calculateJumpPosition(targets[targetIndex].token, targetMode),
          decorationPosition: this.calculateDecorationPosition(targets[targetIndex].token, targetMode),
          chars: firstChar + secondChar,
          isSequence: true,
        });

        targetIndex++;
      }
      if (targetIndex >= targets.length) {
        break;
      }
    }

    return assignments;
  }

  /**
   * Prevent jump labels from visually blending with surrounding text by swapping to uppercase variants
   */
  private avoidVisualConflicts(
    assignments: JumpAssignment[],
    document: vscode.TextDocument,
    jumpCharsSetting: string
  ): JumpAssignment[] {
    const upperCaseAlternatives = jumpCharsSetting
      .toUpperCase()
      .split("")
      .filter((char, index, array) => array.indexOf(char) === index);

    return assignments.map((assignment) => {
      const token = assignment.token;
      const lineText = document.lineAt(token.line).text;
      const charAfterToken = lineText[token.startChar + token.length];

      if (charAfterToken && !assignment.isSequence) {
        // Check if jump char conflicts with next character
        const conflict = assignment.chars.toLowerCase() === charAfterToken.toLowerCase();

        if (conflict) {
          // Try to find an alternative character
          for (const alt of upperCaseAlternatives) {
            if (alt.toLowerCase() !== charAfterToken.toLowerCase()) {
              assignment.chars = alt;
              break;
            }
          }
        }
      }

      return assignment;
    });
  }

  /**
   * Get available second phase characters for a given first character
   */
  getSecondPhaseChars(firstChar: string, assignments: JumpAssignment[]): Map<string, JumpAssignment> {
    const secondPhaseMap = new Map<string, JumpAssignment>();

    assignments
      .filter((a) => a.isSequence && a.chars.startsWith(firstChar))
      .forEach((a) => {
        const secondChar = a.chars[1];
        secondPhaseMap.set(secondChar, a);
      });

    return secondPhaseMap;
  }
}
