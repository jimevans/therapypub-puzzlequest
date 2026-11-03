import {
  type HintRule,
  type Pause,
  QuestPuzzleStatus,
  type QuestState,
  QuestStatus,
  isPaused,
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
  /** True while the clock is running: started, not stopped, not paused. */
  readonly running: boolean;
  /**
   * While the clock is running, the time it would have started to show its
   * elapsed time without pauses; a page's clock counts up from here.
   */
  readonly clockStart?: Date;
  /**
   * Milliseconds from the start to the end, or to now if it hasn't ended,
   * leaving out the time the quest was paused.
   */
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
 * Measures how much of a span of time was spent paused.
 * @param from the start of the span
 * @param to the end of the span
 * @param pauses the quest's pauses
 * @param now the current time, the end of a pause still going on
 * @returns the paused milliseconds within the span
 */
function pausedWithin(
  from: Date,
  to: Date,
  pauses: readonly Pause[],
  now: Date
): number {
  return pauses.reduce((sum, pause) => {
    const pauseEnd = (pause.endTime ?? now).getTime();
    const overlap =
      Math.min(pauseEnd, to.getTime()) -
      Math.max(pause.startTime.getTime(), from.getTime());
    return sum + Math.max(0, overlap);
  }, 0);
}

/**
 * Measures a span of time that may still be going on.
 * @param startTime when it started, if it has
 * @param endTime when it ended, if it has
 * @param active true if it has started and not ended
 * @param penaltyMs penalties to add, in milliseconds
 * @param pauses the quest's pauses, whose time doesn't count
 * @param paused true if the quest is paused now
 * @param now the current time
 * @returns the measured progress
 */
function measure(
  startTime: Date | null | undefined,
  endTime: Date | null | undefined,
  active: boolean,
  penaltyMs: number,
  pauses: readonly Pause[],
  paused: boolean,
  now: Date
): Progress {
  const end = endTime ?? (active ? now : undefined);
  const elapsedMs =
    startTime && end
      ? Math.max(
          0,
          end.getTime() -
            startTime.getTime() -
            pausedWithin(startTime, end, pauses, now)
        )
      : 0;
  const running = active && !paused;
  return {
    startTime: startTime ?? undefined,
    endTime: endTime ?? undefined,
    running,
    clockStart: running ? new Date(now.getTime() - elapsedMs) : undefined,
    elapsedMs,
    penaltyMs,
    totalMs: elapsedMs + penaltyMs,
  };
}

/**
 * Calculates how long players have spent on a quest and each of its
 * puzzles. A puzzle's clock runs from when it becomes available until it is
 * solved; the quest's runs from when its first puzzle becomes available
 * until its last is solved. Time the quest spends paused doesn't count, and
 * while it is paused no clock runs.
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
  const pauses = state.pauses ?? [];
  const paused = isPaused(state);
  const puzzles = state.puzzles.map((puzzle): PuzzleProgress => {
    const penaltyMs = (hints.get(puzzle.puzzleName) ?? [])
      .slice(0, puzzle.nextHintToDisplay)
      .reduce((sum, hint) => sum + hint.timePenalty * 1000, 0);
    const active =
      Boolean(puzzle.startTime) &&
      (puzzle.status === QuestPuzzleStatus.AWAITING_ACTIVATION ||
        puzzle.status === QuestPuzzleStatus.IN_PROGRESS);
    return {
      puzzleName: puzzle.puzzleName,
      ...measure(
        puzzle.startTime,
        puzzle.endTime,
        active,
        penaltyMs,
        pauses,
        paused,
        now
      ),
    };
  });

  const startTime = state.puzzles.at(0)?.startTime;
  const endTime =
    state.status === QuestStatus.COMPLETED
      ? state.puzzles.at(-1)?.endTime
      : undefined;
  const active = Boolean(startTime) && state.status === QuestStatus.IN_PROGRESS;
  const penaltyMs = puzzles.reduce((sum, puzzle) => sum + puzzle.penaltyMs, 0);
  return {
    ...measure(startTime, endTime, active, penaltyMs, pauses, paused, now),
    puzzles,
  };
}
