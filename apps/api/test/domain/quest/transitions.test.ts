import { describe, expect, it, vi } from "vitest";
import {
  type PuzzleRules,
  type PuzzleState,
  QuestPuzzleStatus,
  type QuestState,
  QuestStatus,
  type TransitionResult,
  activatePuzzle,
  isPaused,
  pause,
  reset,
  resetPuzzle,
  resume,
  revealHint,
  skipPuzzle,
  start,
  submitSolution,
} from "../../../src/domain/quest/index.js";

const EARLIER = new Date("2026-11-03T19:00:00Z");
const NOW = new Date("2026-11-03T20:00:00Z");

const rules: PuzzleRules = {
  solutionKeywords: ["red", "fox"],
  hints: [{ timePenalty: 60 }, { timePenalty: 300 }],
};

/**
 * Builds a puzzle's progress.
 * @param puzzleName the puzzle's name
 * @param status the puzzle's status
 * @param changes other fields to set
 * @returns the puzzle
 */
function puzzle(
  puzzleName: string,
  status: QuestPuzzleStatus,
  changes: Partial<PuzzleState> = {}
): PuzzleState {
  return {
    puzzleName,
    status,
    nextHintToDisplay: 0,
    activationCode: `${puzzleName}-code`,
    ...changes,
  };
}

/**
 * Builds a quest's progress, frozen so a test fails if a transition changes
 * its input.
 * @param status the quest's status
 * @param puzzles the puzzles' progress
 * @returns the quest
 */
function quest(status: QuestStatus, puzzles: PuzzleState[]): QuestState {
  return Object.freeze({
    status,
    puzzles: Object.freeze(puzzles.map((p) => Object.freeze(p))),
  });
}

/** A three-puzzle quest that has not started. */
const notStarted = quest(QuestStatus.NOT_STARTED, [
  puzzle("first", QuestPuzzleStatus.UNAVAILABLE),
  puzzle("second", QuestPuzzleStatus.UNAVAILABLE),
  puzzle("third", QuestPuzzleStatus.UNAVAILABLE),
]);

/**
 * Builds an in-progress quest with one puzzle of each status, in order: the
 * first completed, the second (the target) in the given status, and the
 * third not yet reached.
 * @param targetStatus the status of the second puzzle
 * @param changes other fields to set on the second puzzle
 * @returns the quest
 */
function inProgressWith(
  targetStatus: QuestPuzzleStatus,
  changes: Partial<PuzzleState> = {}
): QuestState {
  return quest(QuestStatus.IN_PROGRESS, [
    puzzle("first", QuestPuzzleStatus.COMPLETED, {
      startTime: EARLIER,
      activationTime: EARLIER,
      endTime: EARLIER,
    }),
    puzzle("second", targetStatus, { startTime: EARLIER, ...changes }),
    puzzle("third", QuestPuzzleStatus.UNAVAILABLE),
  ]);
}

/** A quest whose every puzzle is solved. */
const completed = quest(QuestStatus.COMPLETED, [
  puzzle("first", QuestPuzzleStatus.COMPLETED),
  puzzle("second", QuestPuzzleStatus.COMPLETED),
]);

/**
 * Asserts that an action succeeded and narrows its result.
 * @param result the action's result
 * @returns the successful result
 */
function expectSuccess(
  result: TransitionResult
): Extract<TransitionResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(`Expected success, got ${result.error}`);
  }
  return result;
}

describe("start", () => {
  it("starts the quest and makes the first puzzle available", () => {
    const result = expectSuccess(start(notStarted, NOW));

    expect(result.state.status).toBe(QuestStatus.IN_PROGRESS);
    expect(result.state.puzzles.map((p) => p.status)).toEqual([
      QuestPuzzleStatus.AWAITING_ACTIVATION,
      QuestPuzzleStatus.UNAVAILABLE,
      QuestPuzzleStatus.UNAVAILABLE,
    ]);
    expect(result.state.puzzles[0].startTime).toBe(NOW);
    expect(result.state.puzzles[1]).toBe(notStarted.puzzles[1]);
    expect(result.events).toEqual([
      { type: "QuestStarted", at: NOW },
      { type: "PuzzleStarted", puzzleName: "first", at: NOW },
    ]);
  });

  it.each([
    [
      "an in-progress quest",
      inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      "QUEST_ALREADY_STARTED",
    ],
    ["a completed quest", completed, "QUEST_COMPLETED"],
    [
      "a quest with no puzzles",
      quest(QuestStatus.NOT_STARTED, []),
      "NO_PUZZLES",
    ],
  ])("refuses to start %s", (_, state, error) => {
    expect(start(state, NOW)).toEqual({ ok: false, error });
  });
});

describe("activatePuzzle", () => {
  it("activates a puzzle awaiting activation with its code", () => {
    const state = inProgressWith(QuestPuzzleStatus.AWAITING_ACTIVATION);

    const result = expectSuccess(
      activatePuzzle(state, "second", "second-code", NOW)
    );

    expect(result.state.status).toBe(QuestStatus.IN_PROGRESS);
    expect(result.state.puzzles[1]).toEqual({
      ...state.puzzles[1],
      status: QuestPuzzleStatus.IN_PROGRESS,
      activationTime: NOW,
    });
    expect(result.state.puzzles[0]).toBe(state.puzzles[0]);
    expect(result.state.puzzles[2]).toBe(state.puzzles[2]);
    expect(result.events).toEqual([
      { type: "PuzzleActivated", puzzleName: "second", at: NOW },
    ]);
  });

  it("refuses a wrong activation code", () => {
    const state = inProgressWith(QuestPuzzleStatus.AWAITING_ACTIVATION);

    expect(activatePuzzle(state, "second", "first-code", NOW)).toEqual({
      ok: false,
      error: "WRONG_ACTIVATION_CODE",
    });
  });

  it.each(["SECOND-CODE", "Second-code", "  second-code ", "second-code\n"])(
    "ignores letter case and surrounding spaces in code %j",
    (code) => {
      const state = inProgressWith(QuestPuzzleStatus.AWAITING_ACTIVATION);

      expect(activatePuzzle(state, "second", code, NOW).ok).toBe(true);
    }
  );

  it("still refuses a code that differs in more than that", () => {
    const state = inProgressWith(QuestPuzzleStatus.AWAITING_ACTIVATION);

    expect(activatePuzzle(state, "second", "second code", NOW)).toEqual({
      ok: false,
      error: "WRONG_ACTIVATION_CODE",
    });
  });

  it.each([
    ["a quest not started", notStarted, "first", "QUEST_NOT_STARTED"],
    ["a completed quest", completed, "first", "QUEST_COMPLETED"],
    [
      "a puzzle not yet reached",
      inProgressWith(QuestPuzzleStatus.AWAITING_ACTIVATION),
      "third",
      "PUZZLE_NOT_FOUND",
    ],
    [
      "a puzzle not in the quest",
      inProgressWith(QuestPuzzleStatus.AWAITING_ACTIVATION),
      "missing",
      "PUZZLE_NOT_FOUND",
    ],
    [
      "a puzzle already in progress",
      inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      "second",
      "PUZZLE_NOT_AWAITING_ACTIVATION",
    ],
    [
      "a completed puzzle",
      inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      "first",
      "PUZZLE_NOT_AWAITING_ACTIVATION",
    ],
  ])("refuses to activate %s", (_, state, puzzleName, error) => {
    expect(
      activatePuzzle(state, puzzleName, `${puzzleName}-code`, NOW)
    ).toEqual({ ok: false, error });
  });
});

describe("submitSolution", () => {
  it("completes the puzzle and makes the next one available", () => {
    const state = inProgressWith(QuestPuzzleStatus.IN_PROGRESS);

    const result = expectSuccess(
      submitSolution(state, "second", "Red Fox", rules, NOW)
    );

    expect(result.state.status).toBe(QuestStatus.IN_PROGRESS);
    expect(result.state.puzzles[1]).toEqual({
      ...state.puzzles[1],
      status: QuestPuzzleStatus.COMPLETED,
      endTime: NOW,
    });
    expect(result.state.puzzles[2]).toEqual({
      ...state.puzzles[2],
      status: QuestPuzzleStatus.AWAITING_ACTIVATION,
      startTime: NOW,
    });
    expect(result.state.puzzles[0]).toBe(state.puzzles[0]);
    expect(result.events).toEqual([
      { type: "PuzzleSolved", puzzleName: "second", at: NOW },
      { type: "PuzzleStarted", puzzleName: "third", at: NOW },
    ]);
  });

  it("completes the quest after its last puzzle", () => {
    const state = quest(QuestStatus.IN_PROGRESS, [
      puzzle("first", QuestPuzzleStatus.COMPLETED),
      puzzle("last", QuestPuzzleStatus.IN_PROGRESS),
    ]);

    const result = expectSuccess(
      submitSolution(state, "last", "red fox", rules, NOW)
    );

    expect(result.state.status).toBe(QuestStatus.COMPLETED);
    expect(result.state.puzzles[1].status).toBe(QuestPuzzleStatus.COMPLETED);
    expect(result.state.puzzles[1].endTime).toBe(NOW);
    expect(result.events).toEqual([
      { type: "PuzzleSolved", puzzleName: "last", at: NOW },
      { type: "QuestCompleted", at: NOW },
    ]);
  });

  it("refuses a wrong guess", () => {
    const state = inProgressWith(QuestPuzzleStatus.IN_PROGRESS);

    expect(submitSolution(state, "second", "red dog", rules, NOW)).toEqual({
      ok: false,
      error: "WRONG_SOLUTION",
    });
  });

  it("uses the matcher it is given", () => {
    const state = inProgressWith(QuestPuzzleStatus.IN_PROGRESS);
    const matcher = vi.fn(() => true);

    const result = submitSolution(
      state,
      "second",
      "guess",
      rules,
      NOW,
      matcher
    );

    expect(result.ok).toBe(true);
    expect(matcher).toHaveBeenCalledWith("guess", rules.solutionKeywords);
  });

  it.each([
    ["a quest not started", notStarted, "first", "QUEST_NOT_STARTED"],
    ["a completed quest", completed, "first", "QUEST_COMPLETED"],
    [
      "a puzzle not yet reached",
      inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      "third",
      "PUZZLE_NOT_FOUND",
    ],
    [
      "a puzzle not in the quest",
      inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      "missing",
      "PUZZLE_NOT_FOUND",
    ],
    [
      "a puzzle awaiting activation",
      inProgressWith(QuestPuzzleStatus.AWAITING_ACTIVATION),
      "second",
      "PUZZLE_NOT_IN_PROGRESS",
    ],
    [
      "a completed puzzle",
      inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      "first",
      "PUZZLE_NOT_IN_PROGRESS",
    ],
  ])("refuses a solution to %s", (_, state, puzzleName, error) => {
    expect(submitSolution(state, puzzleName, "red fox", rules, NOW)).toEqual({
      ok: false,
      error,
    });
  });
});

describe("revealHint", () => {
  it("reveals the next hint and records its penalty", () => {
    const state = inProgressWith(QuestPuzzleStatus.IN_PROGRESS, {
      nextHintToDisplay: 1,
    });

    const result = expectSuccess(revealHint(state, "second", rules, NOW));

    expect(result.state.status).toBe(QuestStatus.IN_PROGRESS);
    expect(result.state.puzzles[1]).toEqual({
      ...state.puzzles[1],
      nextHintToDisplay: 2,
    });
    expect(result.state.puzzles[0]).toBe(state.puzzles[0]);
    expect(result.state.puzzles[2]).toBe(state.puzzles[2]);
    expect(result.events).toEqual([
      {
        type: "HintRevealed",
        puzzleName: "second",
        hintIndex: 1,
        timePenalty: 300,
        at: NOW,
      },
    ]);
  });

  it("refuses when every hint has been revealed", () => {
    const state = inProgressWith(QuestPuzzleStatus.IN_PROGRESS, {
      nextHintToDisplay: 2,
    });

    expect(revealHint(state, "second", rules, NOW)).toEqual({
      ok: false,
      error: "NO_MORE_HINTS",
    });
  });

  it("refuses when the puzzle has no hints", () => {
    const state = inProgressWith(QuestPuzzleStatus.IN_PROGRESS);

    expect(
      revealHint(state, "second", { solutionKeywords: [], hints: [] }, NOW)
    ).toEqual({ ok: false, error: "NO_MORE_HINTS" });
  });

  it.each([
    ["a quest not started", notStarted, "first", "QUEST_NOT_STARTED"],
    ["a completed quest", completed, "first", "QUEST_COMPLETED"],
    [
      "a puzzle not yet reached",
      inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      "third",
      "PUZZLE_NOT_FOUND",
    ],
    [
      "a puzzle not in the quest",
      inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      "missing",
      "PUZZLE_NOT_FOUND",
    ],
    [
      "a puzzle awaiting activation",
      inProgressWith(QuestPuzzleStatus.AWAITING_ACTIVATION),
      "second",
      "PUZZLE_NOT_IN_PROGRESS",
    ],
    [
      "a completed puzzle",
      inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      "first",
      "PUZZLE_NOT_IN_PROGRESS",
    ],
  ])("refuses a hint for %s", (_, state, puzzleName, error) => {
    expect(revealHint(state, puzzleName, rules, NOW)).toEqual({
      ok: false,
      error,
    });
  });
});

describe("reset", () => {
  it.each([
    ["a quest not started", notStarted],
    ["an in-progress quest", inProgressWith(QuestPuzzleStatus.IN_PROGRESS)],
    ["a completed quest", completed],
  ])("clears the progress of %s", (_, state) => {
    const result = expectSuccess(reset(state, NOW));

    expect(result.state.status).toBe(QuestStatus.NOT_STARTED);
    expect(result.state.puzzles).toEqual(
      state.puzzles.map((p) => ({
        puzzleName: p.puzzleName,
        status: QuestPuzzleStatus.UNAVAILABLE,
        nextHintToDisplay: 0,
        activationCode: p.activationCode,
        startTime: undefined,
        activationTime: undefined,
        endTime: undefined,
        skipped: false,
        penaltyFreeHints: 0,
      }))
    );
    expect(result.events).toEqual([{ type: "QuestReset", at: NOW }]);
  });
});

describe("pause", () => {
  it("pauses a quest in progress, stopping its clocks", () => {
    const state = inProgressWith(QuestPuzzleStatus.IN_PROGRESS);

    const result = expectSuccess(pause(state, NOW));

    expect(result.state.pauses).toEqual([{ startTime: NOW }]);
    expect(isPaused(result.state)).toBe(true);
    expect(result.state.puzzles).toEqual(state.puzzles);
    expect(result.events).toEqual([{ type: "QuestPaused", at: NOW }]);
  });

  it("adds to earlier pauses", () => {
    const earlier = { startTime: EARLIER, endTime: EARLIER };
    const state = {
      ...inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      pauses: [earlier],
    };

    const result = expectSuccess(pause(state, NOW));

    expect(result.state.pauses).toEqual([earlier, { startTime: NOW }]);
  });

  it.each([
    ["a quest not started", notStarted, "QUEST_NOT_STARTED"],
    ["a completed quest", completed, "QUEST_COMPLETED"],
    [
      "a quest already paused",
      {
        ...inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
        pauses: [{ startTime: EARLIER }],
      },
      "QUEST_PAUSED",
    ],
  ])("refuses to pause %s", (_, state, error) => {
    expect(pause(state, NOW)).toEqual({ ok: false, error });
  });
});

describe("resume", () => {
  it("resumes a paused quest, ending its pause", () => {
    const state = {
      ...inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      pauses: [{ startTime: EARLIER }],
    };

    const result = expectSuccess(resume(state, NOW));

    expect(result.state.pauses).toEqual([{ startTime: EARLIER, endTime: NOW }]);
    expect(isPaused(result.state)).toBe(false);
    expect(result.events).toEqual([{ type: "QuestResumed", at: NOW }]);
  });

  it.each([
    ["a quest never paused", inProgressWith(QuestPuzzleStatus.IN_PROGRESS)],
    [
      "a quest already resumed",
      {
        ...inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
        pauses: [{ startTime: EARLIER, endTime: EARLIER }],
      },
    ],
  ])("refuses to resume %s", (_, state) => {
    expect(resume(state, NOW)).toEqual({
      ok: false,
      error: "QUEST_NOT_PAUSED",
    });
  });
});

describe("a paused quest", () => {
  const paused = (status: QuestPuzzleStatus) => ({
    ...inProgressWith(status),
    pauses: [{ startTime: EARLIER }],
  });

  it.each([
    [
      "activating a puzzle",
      (state: QuestState) =>
        activatePuzzle(state, "second", "second-code", NOW),
      QuestPuzzleStatus.AWAITING_ACTIVATION,
    ],
    [
      "solving a puzzle",
      (state: QuestState) =>
        submitSolution(state, "second", "red fox", rules, NOW),
      QuestPuzzleStatus.IN_PROGRESS,
    ],
    [
      "revealing a hint",
      (state: QuestState) => revealHint(state, "second", rules, NOW),
      QuestPuzzleStatus.IN_PROGRESS,
    ],
  ])("refuses %s", (_, action, puzzleStatus) => {
    expect(action(paused(puzzleStatus))).toEqual({
      ok: false,
      error: "QUEST_PAUSED",
    });
  });

  it("can be reset, which clears its pauses", () => {
    const result = expectSuccess(
      reset(paused(QuestPuzzleStatus.IN_PROGRESS), NOW)
    );

    expect(result.state.pauses).toEqual([]);
  });
});

describe("skipPuzzle", () => {
  it.each([
    ["in progress", QuestPuzzleStatus.IN_PROGRESS],
    ["awaiting activation", QuestPuzzleStatus.AWAITING_ACTIVATION],
  ])("completes a puzzle %s and starts the next", (_, status) => {
    const state = inProgressWith(status);

    const result = expectSuccess(skipPuzzle(state, "second", NOW));

    expect(result.state.puzzles[1]).toEqual({
      ...state.puzzles[1],
      status: QuestPuzzleStatus.COMPLETED,
      endTime: NOW,
      skipped: true,
    });
    expect(result.state.puzzles[2]).toMatchObject({
      status: QuestPuzzleStatus.AWAITING_ACTIVATION,
      startTime: NOW,
    });
    expect(result.events).toEqual([
      { type: "PuzzleSkipped", puzzleName: "second", at: NOW },
      { type: "PuzzleStarted", puzzleName: "third", at: NOW },
    ]);
  });

  it("completes the quest when the last puzzle is skipped", () => {
    const state = quest(QuestStatus.IN_PROGRESS, [
      puzzle("first", QuestPuzzleStatus.COMPLETED),
      puzzle("last", QuestPuzzleStatus.IN_PROGRESS),
    ]);

    const result = expectSuccess(skipPuzzle(state, "last", NOW));

    expect(result.state.status).toBe(QuestStatus.COMPLETED);
    expect(result.events).toEqual([
      { type: "PuzzleSkipped", puzzleName: "last", at: NOW },
      { type: "QuestCompleted", at: NOW },
    ]);
  });

  it("works while the quest is paused", () => {
    const state = {
      ...inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      pauses: [{ startTime: EARLIER }],
    };

    const result = expectSuccess(skipPuzzle(state, "second", NOW));

    expect(result.state.pauses).toEqual(state.pauses);
  });

  it.each([
    ["in a quest not started", notStarted, "first", "QUEST_NOT_STARTED"],
    ["in a completed quest", completed, "first", "QUEST_COMPLETED"],
    [
      "not yet reached",
      inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      "third",
      "PUZZLE_NOT_FOUND",
    ],
    [
      "already completed",
      inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      "first",
      "PUZZLE_COMPLETED",
    ],
  ])("refuses to skip a puzzle %s", (_, state, puzzleName, error) => {
    expect(skipPuzzle(state, puzzleName, NOW)).toEqual({ ok: false, error });
  });
});

describe("resetPuzzle", () => {
  // The first puzzle was solved with two hints; the second is in progress
  // with one hint; the third isn't reached.
  const solvedFirst = () =>
    quest(QuestStatus.IN_PROGRESS, [
      puzzle("first", QuestPuzzleStatus.COMPLETED, {
        startTime: EARLIER,
        activationTime: EARLIER,
        endTime: EARLIER,
        nextHintToDisplay: 2,
      }),
      puzzle("second", QuestPuzzleStatus.IN_PROGRESS, {
        startTime: EARLIER,
        activationTime: EARLIER,
        nextHintToDisplay: 1,
      }),
      puzzle("third", QuestPuzzleStatus.UNAVAILABLE),
    ]);

  it("puts the puzzle back in progress, and the later puzzles back to unreached", () => {
    const state = solvedFirst();

    const result = expectSuccess(resetPuzzle(state, "first", false, NOW));

    expect(result.state.status).toBe(QuestStatus.IN_PROGRESS);
    expect(result.state.puzzles[0]).toEqual({
      ...state.puzzles[0],
      status: QuestPuzzleStatus.IN_PROGRESS,
      endTime: undefined,
      skipped: false,
      penaltyFreeHints: 0,
    });
    expect(result.state.puzzles.slice(1)).toEqual(
      state.puzzles.slice(1).map((p) => ({
        ...p,
        status: QuestPuzzleStatus.UNAVAILABLE,
        nextHintToDisplay: 0,
        startTime: undefined,
        activationTime: undefined,
        endTime: undefined,
        skipped: false,
        penaltyFreeHints: 0,
      }))
    );
    expect(result.events).toEqual([
      { type: "PuzzleReset", puzzleName: "first", refundedHints: 0, at: NOW },
    ]);
  });

  it("refunds the revealed hints' penalties when asked, keeping them revealed", () => {
    const result = expectSuccess(
      resetPuzzle(solvedFirst(), "first", true, NOW)
    );

    expect(result.state.puzzles[0]).toMatchObject({
      nextHintToDisplay: 2,
      penaltyFreeHints: 2,
    });
    expect(result.events).toEqual([
      { type: "PuzzleReset", puzzleName: "first", refundedHints: 2, at: NOW },
    ]);
  });

  it("counts only newly refunded hints", () => {
    const state = quest(QuestStatus.IN_PROGRESS, [
      puzzle("first", QuestPuzzleStatus.COMPLETED, {
        nextHintToDisplay: 3,
        penaltyFreeHints: 2,
      }),
    ]);

    const kept = expectSuccess(resetPuzzle(state, "first", false, NOW));
    const refunded = expectSuccess(resetPuzzle(state, "first", true, NOW));

    expect(kept.state.puzzles[0].penaltyFreeHints).toBe(2);
    expect(kept.events[0]).toMatchObject({ refundedHints: 0 });
    expect(refunded.state.puzzles[0].penaltyFreeHints).toBe(3);
    expect(refunded.events[0]).toMatchObject({ refundedHints: 1 });
  });

  it("reopens a completed quest, and clears a skip", () => {
    const state = quest(QuestStatus.COMPLETED, [
      puzzle("first", QuestPuzzleStatus.COMPLETED),
      puzzle("last", QuestPuzzleStatus.COMPLETED, { skipped: true }),
    ]);

    const result = expectSuccess(resetPuzzle(state, "last", false, NOW));

    expect(result.state.status).toBe(QuestStatus.IN_PROGRESS);
    expect(result.state.puzzles[1]).toMatchObject({
      status: QuestPuzzleStatus.IN_PROGRESS,
      skipped: false,
    });
  });

  it("works while the quest is paused", () => {
    const state = { ...solvedFirst(), pauses: [{ startTime: EARLIER }] };

    const result = expectSuccess(resetPuzzle(state, "first", true, NOW));

    expect(result.state.pauses).toEqual(state.pauses);
  });

  it.each([
    ["in a quest not started", notStarted, "first", "QUEST_NOT_STARTED"],
    [
      "not yet reached",
      inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      "third",
      "PUZZLE_NOT_FOUND",
    ],
    [
      "still in progress",
      inProgressWith(QuestPuzzleStatus.IN_PROGRESS),
      "second",
      "PUZZLE_NOT_COMPLETED",
    ],
  ])("refuses to reset a puzzle %s", (_, state, puzzleName, error) => {
    expect(resetPuzzle(state, puzzleName, false, NOW)).toEqual({
      ok: false,
      error,
    });
  });
});

describe("a whole quest", () => {
  it("plays from start to completion", () => {
    let state = quest(QuestStatus.NOT_STARTED, [
      puzzle("first", QuestPuzzleStatus.UNAVAILABLE),
      puzzle("second", QuestPuzzleStatus.UNAVAILABLE),
    ]);
    const steps: ((s: QuestState) => TransitionResult)[] = [
      (s) => start(s, NOW),
      (s) => activatePuzzle(s, "first", "first-code", NOW),
      (s) => revealHint(s, "first", rules, NOW),
      (s) => submitSolution(s, "first", "red fox", rules, NOW),
      (s) => activatePuzzle(s, "second", "second-code", NOW),
      (s) => submitSolution(s, "second", "fox, red", rules, NOW),
    ];
    const eventTypes: string[] = [];
    for (const step of steps) {
      const result = expectSuccess(step(state));
      state = result.state;
      eventTypes.push(...result.events.map((e) => e.type));
    }

    expect(state.status).toBe(QuestStatus.COMPLETED);
    expect(state.puzzles.map((p) => p.status)).toEqual([
      QuestPuzzleStatus.COMPLETED,
      QuestPuzzleStatus.COMPLETED,
    ]);
    expect(eventTypes).toEqual([
      "QuestStarted",
      "PuzzleStarted",
      "PuzzleActivated",
      "HintRevealed",
      "PuzzleSolved",
      "PuzzleStarted",
      "PuzzleActivated",
      "PuzzleSolved",
      "QuestCompleted",
    ]);
  });
});
