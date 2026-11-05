import type { QuestEvent } from "./events.js";
import { type SolutionMatcher, containsAllKeywords } from "./solution.js";
import {
  type PuzzleRules,
  type PuzzleState,
  QuestPuzzleStatus,
  type QuestState,
  QuestStatus,
  isPaused,
} from "./state.js";

/** Why an action isn't allowed. */
export type QuestErrorCode =
  | "QUEST_NOT_STARTED"
  | "QUEST_COMPLETED"
  | "QUEST_ALREADY_STARTED"
  | "NO_PUZZLES"
  | "PUZZLE_NOT_FOUND"
  | "PUZZLE_NOT_AWAITING_ACTIVATION"
  | "PUZZLE_NOT_IN_PROGRESS"
  | "WRONG_ACTIVATION_CODE"
  | "WRONG_SOLUTION"
  | "NO_MORE_HINTS"
  | "QUEST_PAUSED"
  | "QUEST_NOT_PAUSED"
  | "PUZZLE_COMPLETED"
  | "PUZZLE_NOT_COMPLETED";

/**
 * The outcome of an action: the quest's new state and what happened, or why
 * the action isn't allowed. The state passed in is never changed.
 */
export type TransitionResult =
  | {
      readonly ok: true;
      readonly state: QuestState;
      readonly events: readonly QuestEvent[];
    }
  | { readonly ok: false; readonly error: QuestErrorCode };

function succeed(
  state: QuestState,
  events: readonly QuestEvent[]
): TransitionResult {
  return { ok: true, state, events };
}

function fail(error: QuestErrorCode): TransitionResult {
  return { ok: false, error };
}

/**
 * Checks that players can act on a quest: it must be in progress and not
 * paused.
 * @param state the quest
 * @returns why they can't, or undefined if they can
 */
function checkInProgress(state: QuestState): QuestErrorCode | undefined {
  if (state.status === QuestStatus.COMPLETED) {
    return "QUEST_COMPLETED";
  }
  if (state.status !== QuestStatus.IN_PROGRESS) {
    return "QUEST_NOT_STARTED";
  }
  if (isPaused(state)) {
    return "QUEST_PAUSED";
  }
  return undefined;
}

/**
 * Finds a puzzle the players have reached. Puzzles not yet reached are
 * reported as not found, so players can't discover what comes next.
 * @param state the quest
 * @param puzzleName the name of the puzzle
 * @returns the puzzle's index, or -1 if it isn't found or not yet reached
 */
function findReachedPuzzle(state: QuestState, puzzleName: string): number {
  return state.puzzles.findIndex(
    (puzzle) =>
      puzzle.puzzleName === puzzleName &&
      puzzle.status !== QuestPuzzleStatus.UNAVAILABLE
  );
}

/**
 * Copies a quest with changes to some of its puzzles.
 * @param state the quest
 * @param changes the changes, by puzzle index
 * @param status the quest's new status
 * @returns the changed copy
 */
function withPuzzleChanges(
  state: QuestState,
  changes: ReadonlyMap<number, Partial<PuzzleState>>,
  status: QuestStatus = state.status
): QuestState {
  return {
    ...state,
    status,
    puzzles: state.puzzles.map((puzzle, index) => {
      const change = changes.get(index);
      return change ? { ...puzzle, ...change } : puzzle;
    }),
  };
}

/** The progress of a puzzle the players haven't reached. */
const UNREACHED = {
  status: QuestPuzzleStatus.UNAVAILABLE,
  nextHintToDisplay: 0,
  startTime: undefined,
  activationTime: undefined,
  endTime: undefined,
  skipped: false,
  penaltyFreeHints: 0,
} as const;

/**
 * Checks that an administrator can rescue the players on a quest: it must
 * have started. Unlike the players' actions, rescues work while the quest
 * is paused, which is when an administrator fixes a problem.
 * @param state the quest
 * @returns why they can't, or undefined if they can
 */
function checkStarted(state: QuestState): QuestErrorCode | undefined {
  return state.status === QuestStatus.NOT_STARTED
    ? "QUEST_NOT_STARTED"
    : undefined;
}

/**
 * Starts a quest, making its first puzzle available to activate.
 * @param state the quest
 * @param now the current time
 * @returns the outcome
 */
export function start(state: QuestState, now: Date): TransitionResult {
  if (state.status === QuestStatus.COMPLETED) {
    return fail("QUEST_COMPLETED");
  }
  if (state.status !== QuestStatus.NOT_STARTED) {
    return fail("QUEST_ALREADY_STARTED");
  }
  if (state.puzzles.length === 0) {
    return fail("NO_PUZZLES");
  }
  const changes = new Map([
    [0, { status: QuestPuzzleStatus.AWAITING_ACTIVATION, startTime: now }],
  ]);
  return succeed(withPuzzleChanges(state, changes, QuestStatus.IN_PROGRESS), [
    { type: "QuestStarted", at: now },
    { type: "PuzzleStarted", puzzleName: state.puzzles[0].puzzleName, at: now },
  ]);
}

/**
 * Compares activation codes, ignoring letter case and surrounding spaces: phone
 * keyboards often capitalize the first letter of what's typed.
 * @param expected the puzzle's code
 * @param given the code the players gave
 * @returns true if they are the same code
 */
function isSameActivationCode(expected: string, given: string): boolean {
  return expected.trim().toLowerCase() === given.trim().toLowerCase();
}

/**
 * Activates a puzzle that is awaiting activation, using the code the players
 * found (usually in a QR code), so they can start solving it.
 * @param state the quest
 * @param puzzleName the name of the puzzle
 * @param activationCode the code the players gave
 * @param now the current time
 * @returns the outcome
 */
export function activatePuzzle(
  state: QuestState,
  puzzleName: string,
  activationCode: string,
  now: Date
): TransitionResult {
  const questError = checkInProgress(state);
  if (questError) {
    return fail(questError);
  }
  const index = findReachedPuzzle(state, puzzleName);
  if (index < 0) {
    return fail("PUZZLE_NOT_FOUND");
  }
  const puzzle = state.puzzles[index];
  if (puzzle.status !== QuestPuzzleStatus.AWAITING_ACTIVATION) {
    return fail("PUZZLE_NOT_AWAITING_ACTIVATION");
  }
  if (!isSameActivationCode(puzzle.activationCode, activationCode)) {
    return fail("WRONG_ACTIVATION_CODE");
  }
  const changes = new Map([
    [index, { status: QuestPuzzleStatus.IN_PROGRESS, activationTime: now }],
  ]);
  return succeed(withPuzzleChanges(state, changes), [
    { type: "PuzzleActivated", puzzleName, at: now },
  ]);
}

/**
 * Checks a guess at a puzzle's solution. A correct guess completes the
 * puzzle and makes the next one available to activate, or completes the
 * quest after its last puzzle.
 * @param state the quest
 * @param puzzleName the name of the puzzle
 * @param guess the players' guess
 * @param rules the puzzle's solution keywords and hints
 * @param now the current time
 * @param matcher decides whether the guess is correct
 * @returns the outcome
 */
export function submitSolution(
  state: QuestState,
  puzzleName: string,
  guess: string,
  rules: PuzzleRules,
  now: Date,
  matcher: SolutionMatcher = containsAllKeywords
): TransitionResult {
  const questError = checkInProgress(state);
  if (questError) {
    return fail(questError);
  }
  const index = findReachedPuzzle(state, puzzleName);
  if (index < 0) {
    return fail("PUZZLE_NOT_FOUND");
  }
  if (state.puzzles[index].status !== QuestPuzzleStatus.IN_PROGRESS) {
    return fail("PUZZLE_NOT_IN_PROGRESS");
  }
  if (!matcher(guess, rules.solutionKeywords)) {
    return fail("WRONG_SOLUTION");
  }

  const changes = new Map<number, Partial<PuzzleState>>([
    [index, { status: QuestPuzzleStatus.COMPLETED, endTime: now }],
  ]);
  const events: QuestEvent[] = [{ type: "PuzzleSolved", puzzleName, at: now }];
  const next = state.puzzles[index + 1];
  if (next) {
    changes.set(index + 1, {
      status: QuestPuzzleStatus.AWAITING_ACTIVATION,
      startTime: now,
    });
    events.push({
      type: "PuzzleStarted",
      puzzleName: next.puzzleName,
      at: now,
    });
    return succeed(withPuzzleChanges(state, changes), events);
  }
  events.push({ type: "QuestCompleted", at: now });
  return succeed(
    withPuzzleChanges(state, changes, QuestStatus.COMPLETED),
    events
  );
}

/**
 * Reveals the next hint for a puzzle the players are solving.
 * @param state the quest
 * @param puzzleName the name of the puzzle
 * @param rules the puzzle's solution keywords and hints
 * @param now the current time
 * @returns the outcome; the HintRevealed event says which hint was revealed
 */
export function revealHint(
  state: QuestState,
  puzzleName: string,
  rules: PuzzleRules,
  now: Date
): TransitionResult {
  const questError = checkInProgress(state);
  if (questError) {
    return fail(questError);
  }
  const index = findReachedPuzzle(state, puzzleName);
  if (index < 0) {
    return fail("PUZZLE_NOT_FOUND");
  }
  const puzzle = state.puzzles[index];
  if (puzzle.status !== QuestPuzzleStatus.IN_PROGRESS) {
    return fail("PUZZLE_NOT_IN_PROGRESS");
  }
  const hintIndex = puzzle.nextHintToDisplay;
  if (hintIndex >= rules.hints.length) {
    return fail("NO_MORE_HINTS");
  }
  const changes = new Map([[index, { nextHintToDisplay: hintIndex + 1 }]]);
  return succeed(withPuzzleChanges(state, changes), [
    {
      type: "HintRevealed",
      puzzleName,
      hintIndex,
      timePenalty: rules.hints[hintIndex].timePenalty,
      at: now,
    },
  ]);
}

/**
 * Clears a quest's progress, including its pauses, so it can be played
 * again. Activation codes are kept. Any quest can be reset.
 * @param state the quest
 * @param now the current time
 * @returns the outcome
 */
export function reset(state: QuestState, now: Date): TransitionResult {
  return succeed(
    {
      status: QuestStatus.NOT_STARTED,
      pauses: [],
      puzzles: state.puzzles.map((puzzle) => ({
        ...puzzle,
        ...UNREACHED,
      })),
    },
    [{ type: "QuestReset", at: now }]
  );
}

/**
 * Pauses a quest in progress, as an administrator does for a reason beyond
 * the players' control, such as correcting a badly written puzzle. Its
 * clocks stop, and the players can't act until it resumes.
 * @param state the quest
 * @param now the current time
 * @returns the outcome
 */
export function pause(state: QuestState, now: Date): TransitionResult {
  const questError = checkInProgress(state);
  if (questError) {
    return fail(questError);
  }
  return succeed(
    { ...state, pauses: [...(state.pauses ?? []), { startTime: now }] },
    [{ type: "QuestPaused", at: now }]
  );
}

/**
 * Resumes a paused quest, restarting its clocks.
 * @param state the quest
 * @param now the current time
 * @returns the outcome
 */
export function resume(state: QuestState, now: Date): TransitionResult {
  const pauses = state.pauses ?? [];
  if (!isPaused(state)) {
    return fail("QUEST_NOT_PAUSED");
  }
  return succeed(
    {
      ...state,
      pauses: [
        ...pauses.slice(0, -1),
        { ...pauses[pauses.length - 1], endTime: now },
      ],
    },
    [{ type: "QuestResumed", at: now }]
  );
}

/**
 * Completes a puzzle the players are stuck on, without a solution or a
 * penalty, as an administrator does; the next puzzle becomes available to
 * activate, or the quest is complete. The puzzle is marked as skipped, and
 * its time so far still counts.
 * @param state the quest
 * @param puzzleName the name of the puzzle
 * @param now the current time
 * @returns the outcome
 */
export function skipPuzzle(
  state: QuestState,
  puzzleName: string,
  now: Date
): TransitionResult {
  const questError = checkStarted(state);
  if (questError) {
    return fail(questError);
  }
  if (state.status === QuestStatus.COMPLETED) {
    return fail("QUEST_COMPLETED");
  }
  const index = findReachedPuzzle(state, puzzleName);
  if (index < 0) {
    return fail("PUZZLE_NOT_FOUND");
  }
  if (state.puzzles[index].status === QuestPuzzleStatus.COMPLETED) {
    return fail("PUZZLE_COMPLETED");
  }
  const changes = new Map<number, Partial<PuzzleState>>([
    [
      index,
      { status: QuestPuzzleStatus.COMPLETED, endTime: now, skipped: true },
    ],
  ]);
  const events: QuestEvent[] = [{ type: "PuzzleSkipped", puzzleName, at: now }];
  const next = state.puzzles[index + 1];
  if (next) {
    changes.set(index + 1, {
      status: QuestPuzzleStatus.AWAITING_ACTIVATION,
      startTime: now,
    });
    events.push({
      type: "PuzzleStarted",
      puzzleName: next.puzzleName,
      at: now,
    });
    return succeed(withPuzzleChanges(state, changes), events);
  }
  events.push({ type: "QuestCompleted", at: now });
  return succeed(
    withPuzzleChanges(state, changes, QuestStatus.COMPLETED),
    events
  );
}

/**
 * Undoes a puzzle's completion, as an administrator does when a wrong answer
 * was accepted, such as because the puzzle was badly written: the puzzle is
 * back in progress (without being activated again), every puzzle after it
 * is no longer reached, and a completed quest is in progress again. The
 * puzzle's time carries on from when it started.
 * @param state the quest
 * @param puzzleName the name of the puzzle
 * @param refundHints true to remove the penalties of the hints already
 *  revealed for the puzzle; they stay revealed
 * @param now the current time
 * @returns the outcome
 */
export function resetPuzzle(
  state: QuestState,
  puzzleName: string,
  refundHints: boolean,
  now: Date
): TransitionResult {
  const questError = checkStarted(state);
  if (questError) {
    return fail(questError);
  }
  const index = findReachedPuzzle(state, puzzleName);
  if (index < 0) {
    return fail("PUZZLE_NOT_FOUND");
  }
  const puzzle = state.puzzles[index];
  if (puzzle.status !== QuestPuzzleStatus.COMPLETED) {
    return fail("PUZZLE_NOT_COMPLETED");
  }
  const alreadyFree = puzzle.penaltyFreeHints ?? 0;
  const penaltyFreeHints = refundHints ? puzzle.nextHintToDisplay : alreadyFree;
  return succeed(
    {
      ...state,
      status: QuestStatus.IN_PROGRESS,
      puzzles: state.puzzles.map((other, otherIndex) => {
        if (otherIndex < index) {
          return other;
        }
        if (otherIndex > index) {
          return { ...other, ...UNREACHED };
        }
        return {
          ...other,
          status: QuestPuzzleStatus.IN_PROGRESS,
          endTime: undefined,
          skipped: false,
          penaltyFreeHints,
        };
      }),
    },
    [
      {
        type: "PuzzleReset",
        puzzleName,
        refundedHints: penaltyFreeHints - alreadyFree,
        at: now,
      },
    ]
  );
}
