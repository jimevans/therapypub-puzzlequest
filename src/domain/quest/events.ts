/** The quest was started. */
export interface QuestStarted {
  readonly type: "QuestStarted";
  readonly at: Date;
}

/** A puzzle became available to activate. */
export interface PuzzleStarted {
  readonly type: "PuzzleStarted";
  readonly puzzleName: string;
  readonly at: Date;
}

/** A puzzle was activated with its activation code. */
export interface PuzzleActivated {
  readonly type: "PuzzleActivated";
  readonly puzzleName: string;
  readonly at: Date;
}

/** A puzzle was solved. */
export interface PuzzleSolved {
  readonly type: "PuzzleSolved";
  readonly puzzleName: string;
  readonly at: Date;
}

/** A puzzle hint was revealed. */
export interface HintRevealed {
  readonly type: "HintRevealed";
  readonly puzzleName: string;
  /** The index of the revealed hint in the puzzle's hints. */
  readonly hintIndex: number;
  /** The time penalty, in seconds, for revealing the hint. */
  readonly timePenalty: number;
  readonly at: Date;
}

/** The last puzzle of the quest was solved. */
export interface QuestCompleted {
  readonly type: "QuestCompleted";
  readonly at: Date;
}

/** An administrator completed a puzzle for the players, without a penalty. */
export interface PuzzleSkipped {
  readonly type: "PuzzleSkipped";
  readonly puzzleName: string;
  readonly at: Date;
}

/**
 * An administrator undid a puzzle's solution, so the players solve it
 * again; the puzzles after it are no longer reached.
 */
export interface PuzzleReset {
  readonly type: "PuzzleReset";
  readonly puzzleName: string;
  /** How many revealed hints had their penalties refunded. */
  readonly refundedHints: number;
  readonly at: Date;
}

/** An administrator paused the quest, stopping its clocks. */
export interface QuestPaused {
  readonly type: "QuestPaused";
  readonly at: Date;
}

/** An administrator resumed the quest, restarting its clocks. */
export interface QuestResumed {
  readonly type: "QuestResumed";
  readonly at: Date;
}

/** The quest's progress was cleared. */
export interface QuestReset {
  readonly type: "QuestReset";
  readonly at: Date;
}

/** Something that happened in a quest. */
export type QuestEvent =
  | QuestStarted
  | PuzzleStarted
  | PuzzleActivated
  | PuzzleSolved
  | HintRevealed
  | QuestCompleted
  | PuzzleSkipped
  | PuzzleReset
  | QuestPaused
  | QuestResumed
  | QuestReset;
