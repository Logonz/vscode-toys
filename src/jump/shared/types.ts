import * as vscode from "vscode";

/**
 * Base interface containing all common match properties
 */
export interface BaseMatch {
  position: vscode.Position;
  text: string;
  pattern: string;
  line: number;
  startChar: number;
  endChar: number;
}

/**
 * Regular match - extends base with no additional fields
 * Used for simple pattern matching without context
 */
export interface RegularMatch extends BaseMatch {
  // No additional fields - keeps regular jump clean and focused
}

/**
 * Hybrid match - extends base with context-aware fields
 * Used for more intelligent pattern matching with word boundaries
 */
export interface HybridMatch extends BaseMatch {
  /** Full word containing this match for better context */
  fullWord?: string;
  /** Next character after match for pattern continuation */
  nextChar?: string;
}

/**
 * Generic labeled match that works with any match type
 * Adds jump character assignment for user interaction
 */
export interface LabeledMatch<T extends BaseMatch = BaseMatch> extends BaseMatch {
  /** Character assigned for jumping to this match */
  jumpChar: string;
  /** Whether this uses a multi-character sequence */
  isSequence: boolean;
  /** Full word containing this match for hybrid mode */
  fullWord?: string;
  /** Next character after match for hybrid mode */
  nextChar?: string;
}

/**
 * Generic jump target interface for all jump modes
 */
export interface JumpTarget<T extends BaseMatch = BaseMatch> {
  match: T;
  position: vscode.Position;
  char: string;
}

// Type aliases for specific labeled match types
export type RegularLabeledMatch = LabeledMatch<RegularMatch>;
export type HybridLabeledMatch = LabeledMatch<HybridMatch>;

// Type aliases for specific jump targets
export type RegularJumpTarget = JumpTarget<RegularMatch>;
export type HybridJumpTarget = JumpTarget<HybridMatch>;