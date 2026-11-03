import {
  type HintRule,
  QuestPuzzleStatus,
  type QuestState,
  QuestStatus,
} from "./state.js";

/**
 * How long players have spent on part of a quest. Their score is the total:
 * the time taken plus the time penalties of the hints they revealed. Lower
 * is better.
 */
export interface Progress {
  /** When the clock started, if it has. */
  readonly startTime?: Date;
  /** When the clock stopped, if it has. */
  readonly endTime?: Date;
  /** True while the clock is running. */
  readonly running: boolean;
  /** Milliseconds from the start to the end, or to now while running. */
  readonly elapsedMs: number;
  /** The time penalties of the revealed hints, in milliseconds. */
  readonly penaltyMs: number;
  /** The elapsed time plus the penalties, in milliseconds. */
  readonly totalMs: number;
}

/** How long players have spent on a puzzle. */
export interface PuzzleProgress extends Progress {
  /** The name of the puzzle. */
  readonly puzzleName: string;
}

/** How long players have spent on a quest, overall and per puzzle. */
export interface QuestProgress extends Progress {
  /** The progress on each puzzle, in quest order. */
  readonly puzzles: readonly PuzzleProgress[];
}

/**
 * Measures a span of time that may still be running.
 * @param startTime when it started, if it has
 * @param endTime when it ended, if it has
 * @param running true if it is still running
 * @param penaltyMs penalties to add, in milliseconds
 * @param now the current time
 * @returns the measured progress
 */
function measure(
  startTime: Date | null | undefined,
  endTime: Date | null | undefined,
  running: boolean,
  penaltyMs: number,
  now: Date
): Progress {
  const end = endTime ?? (running ? now : undefined);
  const elapsedMs =
    startTime && end ? Math.max(0, end.getTime() - startTime.getTime()) : 0;
  return {
    startTime: startTime ?? undefined,
    endTime: endTime ?? undefined,
    running,
    elapsedMs,
    penaltyMs,
    totalMs: elapsedMs + penaltyMs,
  };
}

/**
 * Calculates how long players have spent on a quest and each of its
 * puzzles. A puzzle's clock runs from when it becomes available until it is
 * solved; the quest's runs from when its first puzzle becomes available
 * until its last is solved.
 * @param state the quest
 * @param hints each puzzle's hints, by puzzle name; a puzzle missing from
 *  the map (because it has been deleted) has no penalties
 * @param now the current time
 * @returns the quest's progress
 */
export function calculateProgress(
  state: QuestState,
  hints: ReadonlyMap<string, readonly HintRule[]>,
  now: Date
): QuestProgress {
  const puzzles = state.puzzles.map((puzzle): PuzzleProgress => {
    const penaltyMs = (hints.get(puzzle.puzzleName) ?? [])
      .slice(0, puzzle.nextHintToDisplay)
      .reduce((sum, hint) => sum + hint.timePenalty * 1000, 0);
    const running =
      Boolean(puzzle.startTime) &&
      (puzzle.status === QuestPuzzleStatus.AWAITING_ACTIVATION ||
        puzzle.status === QuestPuzzleStatus.IN_PROGRESS);
    return {
      puzzleName: puzzle.puzzleName,
      ...measure(puzzle.startTime, puzzle.endTime, running, penaltyMs, now),
    };
  });

  const startTime = state.puzzles.at(0)?.startTime;
  const endTime =
    state.status === QuestStatus.COMPLETED
      ? state.puzzles.at(-1)?.endTime
      : undefined;
  const running =
    Boolean(startTime) && state.status === QuestStatus.IN_PROGRESS;
  const penaltyMs = puzzles.reduce((sum, puzzle) => sum + puzzle.penaltyMs, 0);
  return {
    ...measure(startTime, endTime, running, penaltyMs, now),
    puzzles,
  };
}
