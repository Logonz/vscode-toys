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
  position: vscode.Position;
  chars: string; // Single char or multi-char sequence
  isSequence: boolean;
};

export type DensityLevel = "low" | "medium" | "high";

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

  private readonly defaultDensityThresholds = {
    lowToMedium: 15,
    mediumToHigh: 40,
  };

  /**
   * Main entry point - assigns jump characters to tokens using Flash.nvim-inspired algorithm
   */
  assignChars(
    tokens: DecodedToken[],
    cursorPosition: vscode.Position,
    document: vscode.TextDocument
  ): JumpAssignment[] {
    // Get configuration
    const config = vscode.workspace.getConfiguration("vstoys.semantic-jump");

    // Step 1: Cluster related tokens (if enabled)
    const clusteringEnabled = config.get<boolean>("clusteringEnabled", true);
    const clusters = clusteringEnabled ? this.detectClusters(tokens) : [];

    // Step 2: Score and filter targets
    const scoredTargets = this.scoreTargets(tokens, clusters, cursorPosition, config);

    // Step 3: Calculate density and choose strategy
    const density = this.calculateDensity(scoredTargets.length, config);

    // Step 4: Assign characters based on density
    let assignments = this.performAdaptiveAssignment(scoredTargets, density, config);

    // Step 5: Avoid visual conflicts
    assignments = this.avoidVisualConflicts(assignments, document, config);

    return assignments;
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
   * Calculate density level based on number of targets
   */
  private calculateDensity(targetCount: number, config: vscode.WorkspaceConfiguration): DensityLevel {
    const thresholds = { ...this.defaultDensityThresholds, ...config.get<any>("densityThresholds", {}) };

    if (targetCount <= thresholds.lowToMedium) return "low";
    if (targetCount <= thresholds.mediumToHigh) return "medium";
    return "high";
  }

  /**
   * Perform adaptive character assignment based on density
   */
  private performAdaptiveAssignment(
    targets: ScoredTarget[],
    density: DensityLevel,
    config: vscode.WorkspaceConfiguration
  ): JumpAssignment[] {
    switch (density) {
      case "low":
        return this.assignSingleChars(targets, config);
      case "medium":
        return this.assignMixedChars(targets, config);
      case "high":
        return this.assignProgressiveChars(targets, config);
    }
  }

  /**
   * Assign single characters (low density)
   */
  private assignSingleChars(targets: ScoredTarget[], config: vscode.WorkspaceConfiguration): JumpAssignment[] {
    const jumpChars = config.get<string>("jumpCharacters", "fjdkslaghrueiwoncmv");
    const availableChars = jumpChars.split("");

    return targets.slice(0, availableChars.length).map((target, i) => ({
      token: target.token,
      position: new vscode.Position(target.token.line, target.token.startChar),
      chars: availableChars[i],
      isSequence: false,
    }));
  }

  /**
   * Assign mixed single and two-char sequences (medium density)
   */
  private assignMixedChars(targets: ScoredTarget[], config: vscode.WorkspaceConfiguration): JumpAssignment[] {
    const assignments: JumpAssignment[] = [];
    const jumpChars = config.get<string>("jumpCharacters", "fjdkslaghrueiwoncmv");

    // Smart splitting: use first 8 chars as home row, rest as extended
    const homeRowChars = jumpChars.slice(0, 8).split("");
    const extendedChars = jumpChars.slice(8, 20).split("");

    // Top priority targets get single home row chars
    const singleCharCount = homeRowChars.length;
    targets.slice(0, singleCharCount).forEach((target, i) => {
      assignments.push({
        token: target.token,
        position: new vscode.Position(target.token.line, target.token.startChar),
        chars: homeRowChars[i],
        isSequence: false,
      });
    });

    // Remaining targets get two-char sequences
    const remaining = targets.slice(singleCharCount);
    let sequenceIndex = 0;

    for (const target of remaining) {
      if (sequenceIndex >= extendedChars.length * homeRowChars.length) break;

      const firstCharIndex = Math.floor(sequenceIndex / homeRowChars.length);
      const secondCharIndex = sequenceIndex % homeRowChars.length;

      if (firstCharIndex < extendedChars.length) {
        assignments.push({
          token: target.token,
          position: new vscode.Position(target.token.line, target.token.startChar),
          chars: extendedChars[firstCharIndex] + homeRowChars[secondCharIndex],
          isSequence: true,
        });
      }

      sequenceIndex++;
    }

    return assignments;
  }

  /**
   * Assign progressive two-char sequences (high density)
   */
  private assignProgressiveChars(targets: ScoredTarget[], config: vscode.WorkspaceConfiguration): JumpAssignment[] {
    const assignments: JumpAssignment[] = [];
    const jumpChars = config.get<string>("jumpCharacters", "fjdkslaghrueiwoncmv");

    // Use first 8 chars for first position, all chars for second position
    const firstChars = jumpChars.slice(0, 8).split("");
    const secondChars = jumpChars.split("");

    let targetIndex = 0;

    for (const firstChar of firstChars) {
      for (const secondChar of secondChars) {
        if (targetIndex >= targets.length) break;

        assignments.push({
          token: targets[targetIndex].token,
          position: new vscode.Position(targets[targetIndex].token.line, targets[targetIndex].token.startChar),
          chars: firstChar + secondChar,
          isSequence: true,
        });

        targetIndex++;
      }
      if (targetIndex >= targets.length) break;
    }

    return assignments;
  }

  /**
   * Avoid visual conflicts with surrounding text
   */
  private avoidVisualConflicts(
    assignments: JumpAssignment[],
    document: vscode.TextDocument,
    config: vscode.WorkspaceConfiguration
  ): JumpAssignment[] {
    const jumpChars = config.get<string>("jumpCharacters", "fjdkslaghrueiwoncmv");
    const upperCaseAlternatives = jumpChars.toUpperCase().split("");

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
