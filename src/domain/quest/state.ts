/** The progress of a quest. */
export const QuestStatus = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  COMPLETED: 2,
} as const;
export type QuestStatus = (typeof QuestStatus)[keyof typeof QuestStatus];

/** The progress of a puzzle within a quest. */
export const QuestPuzzleStatus = {
  UNAVAILABLE: 0,
  AWAITING_ACTIVATION: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3,
} as const;
export type QuestPuzzleStatus =
  (typeof QuestPuzzleStatus)[keyof typeof QuestPuzzleStatus];

/**
 * The progress on one puzzle of a quest. The field names match the stored
 * quest, so the service can map between the two directly.
 */
export interface PuzzleState {
  /** The unique name of the puzzle. */
  readonly puzzleName: string;
  /** The progress on the puzzle. */
  readonly status: QuestPuzzleStatus;
  /** The index in the puzzle's hints of the next hint to reveal. */
  readonly nextHintToDisplay: number;
  /** The code that activates this puzzle in this quest. */
  readonly activationCode: string;
  /** When the puzzle became available to activate. */
  readonly startTime?: Date | null;
  /** When the puzzle was activated. */
  readonly activationTime?: Date | null;
  /** When the puzzle was solved. */
  readonly endTime?: Date | null;
}

/** The progress on a quest. */
export interface QuestState {
  /** The progress on the quest as a whole. */
  readonly status: QuestStatus;
  /** The progress on each of the quest's puzzles, in order. */
  readonly puzzles: readonly PuzzleState[];
}

/** A puzzle hint, as far as the rules of the game are concerned. */
export interface HintRule {
  /** The time penalty, in seconds, for revealing the hint. */
  readonly timePenalty: number;
}

/**
 * The parts of a puzzle definition that the rules need. The caller loads
 * them, so the domain never reads the database.
 */
export interface PuzzleRules {
  /** The keywords a correct solution must contain. */
  readonly solutionKeywords: readonly string[];
  /** The puzzle's hints, in the order they are revealed. */
  readonly hints: readonly HintRule[];
}
