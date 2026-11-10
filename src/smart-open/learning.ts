import type { Memento } from "vscode";
import { DEFAULT_WEIGHTS, SIGNALS, type Signal, type SignalValues, type Weights } from "./ranking";

/** How far one pick can move the weights in total. Higher learns faster but swings more. */
const ADJUSTMENT_POINTS = 0.6;
const MAX_GREATER_MISSES = 15;
/** Learning keeps each weight between a quarter and four times its default (and at least 1), so no signal can take over or vanish. */
const WEIGHT_RANGE_FACTOR = 4;
const MIN_WEIGHT = 1;
const PICK_POSITIONS_KEPT = 100;
const STORAGE_KEY = "vstoys.smart-open.learning";

/** A result as it was shown when the user picked. */
export interface ShownResult {
  readonly signals: SignalValues;
  readonly isCurrentFile: boolean;
}

/**
 * smart-open.nvim's self-tuning rule, made to conserve weight. The results ranked above the pick (up to 15)
 * are misses; when the top result was picked, the one below it is, at a tenth of the strength. For each miss,
 * weight moves from the signals where the miss scored higher to those where the pick did, in proportion to
 * the differences.
 *
 * Unlike smart-open.nvim, a miss that beat the pick on every differing signal (a sibling file with a slightly
 * better name match) changes nothing: deducting there without adding anywhere drains every weight over time,
 * until context outweighs text.
 *
 * @param shown The results in the order they were shown.
 * @param pickedPosition The pick's position in `shown`.
 */
export function reviseWeights(weights: Weights, shown: readonly ShownResult[], pickedPosition: number): Weights {
  const picked = shown[pickedPosition];
  if (!picked || picked.isCurrentFile) {
    return weights; // Going back to the current file says nothing about the ranking.
  }
  const misses =
    pickedPosition > 0 ? shown.slice(0, Math.min(pickedPosition, MAX_GREATER_MISSES)) : shown.slice(1, 2);
  const strength = pickedPosition > 0 ? 1 : 0.1;

  const revised: Record<Signal, number> = { ...weights };
  for (const miss of misses) {
    adjust(revised, picked, miss, strength / misses.length);
  }
  return revised;
}

function adjust(weights: Record<Signal, number>, hit: ShownResult, miss: ShownResult, factor: number): void {
  if (miss.isCurrentFile) {
    return;
  }
  let totalGain = 0;
  let totalLoss = 0;
  for (const signal of SIGNALS) {
    const difference = hit.signals[signal] - miss.signals[signal];
    if (difference > 0) {
      totalGain += difference;
    } else {
      totalLoss -= difference;
    }
  }
  if (totalGain === 0 || totalLoss === 0) {
    return; // Nothing to move weight from, or to.
  }
  for (const signal of SIGNALS) {
    const difference = hit.signals[signal] - miss.signals[signal];
    const share = difference > 0 ? difference / totalGain : difference / totalLoss;
    weights[signal] = clampToRange(signal, weights[signal] + ADJUSTMENT_POINTS * factor * share);
  }
}

function clampToRange(signal: Signal, weight: number): number {
  const lowest = Math.max(MIN_WEIGHT, DEFAULT_WEIGHTS[signal] / WEIGHT_RANGE_FACTOR);
  const highest = DEFAULT_WEIGHTS[signal] * WEIGHT_RANGE_FACTOR;
  return Math.min(highest, Math.max(lowest, weight));
}

interface StoredLearning {
  readonly weights: Partial<Record<Signal, number>>;
  readonly pickPositions: number[];
}

/**
 * The learned weights and how well ranking has done lately. Kept in global state, since they describe the
 * user rather than a project, and read from it on every use: all windows share it, and any may have learned.
 */
export class LearnedRanking {
  constructor(
    private readonly storage: Memento,
    private readonly log: (message: string) => void
  ) {
    readWeights(storage.get<unknown>(STORAGE_KEY), log); // Reports unusable stored values once; later reads ignore them quietly.
  }

  get weights(): Weights {
    return readWeights(this.storage.get<unknown>(STORAGE_KEY), () => {});
  }

  /** Average 0-based position of the last picks (0 means the top result every time), or undefined before the first pick. */
  get averagePickPosition(): number | undefined {
    const positions = readPickPositions(this.storage.get<unknown>(STORAGE_KEY));
    if (positions.length === 0) {
      return undefined;
    }
    return positions.reduce((sum, position) => sum + position, 0) / positions.length;
  }

  get pickCount(): number {
    return readPickPositions(this.storage.get<unknown>(STORAGE_KEY)).length;
  }

  learnFromPick(shown: readonly ShownResult[], pickedPosition: number): void {
    const stored = this.storage.get<unknown>(STORAGE_KEY);
    this.save(
      reviseWeights(readWeights(stored, () => {}), shown, pickedPosition),
      [...readPickPositions(stored), pickedPosition].slice(-PICK_POSITIONS_KEPT)
    );
  }

  reset(): void {
    this.save(DEFAULT_WEIGHTS, []);
  }

  private save(weights: Weights, pickPositions: number[]): void {
    const stored: StoredLearning = { weights: { ...weights }, pickPositions };
    this.storage.update(STORAGE_KEY, stored).then(undefined, (error) => {
      this.log(`Could not save the learned ranking: ${error}`);
    });
  }
}

/**
 * Keeps each stored weight that is a number, within the learning range (a stored weight may predate it);
 * signals added since the last save start at their default.
 */
function readWeights(stored: unknown, log: (message: string) => void): Weights {
  const storedWeights = isRecord(stored) && isRecord(stored.weights) ? stored.weights : {};
  const weights: Record<Signal, number> = { ...DEFAULT_WEIGHTS };
  for (const signal of SIGNALS) {
    const value = storedWeights[signal];
    if (typeof value === "number" && Number.isFinite(value)) {
      weights[signal] = clampToRange(signal, value);
    } else if (value !== undefined) {
      log(`Ignoring the stored weight for ${signal} (${JSON.stringify(value)}); using ${DEFAULT_WEIGHTS[signal]}.`);
    }
  }
  return weights;
}

function readPickPositions(stored: unknown): number[] {
  const positions = isRecord(stored) && Array.isArray(stored.pickPositions) ? stored.pickPositions : [];
  return positions.filter((position): position is number => Number.isInteger(position) && position >= 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
