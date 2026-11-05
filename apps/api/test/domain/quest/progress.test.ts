import { describe, expect, it } from "vitest";
import {
  type HintRule,
  type PuzzleState,
  QuestPuzzleStatus,
  QuestStatus,
  calculateProgress,
} from "../../../src/domain/quest/index.js";

const MINUTE = 60 * 1000;
const T0 = new Date("2026-11-03T19:00:00Z");

/**
 * Gets the time some minutes after T0.
 * @param minutes the minutes
 * @returns the time
 */
function at(minutes: number): Date {
  return new Date(T0.getTime() + minutes * MINUTE);
}

function puzzle(
  puzzleName: string,
  status: QuestPuzzleStatus,
  changes: Partial<PuzzleState> = {}
): PuzzleState {
  return {
    puzzleName,
    status,
    nextHintToDisplay: 0,
    activationCode: "code",
    ...changes,
  };
}

const hints = new Map<string, HintRule[]>([
  ["first", [{ timePenalty: 60 }, { timePenalty: 300 }]],
  ["second", [{ timePenalty: 120 }]],
]);

describe("calculateProgress", () => {
  it("measures a quest that has not started as no time at all", () => {
    const progress = calculateProgress(
      {
        status: QuestStatus.NOT_STARTED,
        puzzles: [puzzle("first", QuestPuzzleStatus.UNAVAILABLE)],
      },
      hints,
      at(10)
    );

    expect(progress).toEqual({
      startTime: undefined,
      endTime: undefined,
      running: false,
      elapsedMs: 0,
      penaltyMs: 0,
      totalMs: 0,
      puzzles: [
        {
          puzzleName: "first",
          startTime: undefined,
          endTime: undefined,
          running: false,
          elapsedMs: 0,
          penaltyMs: 0,
          totalMs: 0,
        },
      ],
    });
  });

  it("runs the clocks of a quest in progress until now, adding revealed hints' penalties", () => {
    const progress = calculateProgress(
      {
        status: QuestStatus.IN_PROGRESS,
        puzzles: [
          puzzle("first", QuestPuzzleStatus.COMPLETED, {
            startTime: at(0),
            activationTime: at(2),
            endTime: at(20),
            nextHintToDisplay: 2,
          }),
          puzzle("second", QuestPuzzleStatus.IN_PROGRESS, {
            startTime: at(20),
            activationTime: at(25),
            nextHintToDisplay: 1,
          }),
          puzzle("third", QuestPuzzleStatus.UNAVAILABLE),
        ],
      },
      hints,
      at(30)
    );

    expect(progress).toMatchObject({
      startTime: at(0),
      endTime: undefined,
      running: true,
      elapsedMs: 30 * MINUTE,
      penaltyMs: (60 + 300 + 120) * 1000,
      totalMs: 30 * MINUTE + (60 + 300 + 120) * 1000,
    });
    expect(progress.puzzles).toEqual([
      {
        puzzleName: "first",
        startTime: at(0),
        endTime: at(20),
        running: false,
        elapsedMs: 20 * MINUTE,
        penaltyMs: 360 * 1000,
        totalMs: 20 * MINUTE + 360 * 1000,
      },
      {
        puzzleName: "second",
        startTime: at(20),
        endTime: undefined,
        running: true,
        clockStart: at(20),
        elapsedMs: 10 * MINUTE,
        penaltyMs: 120 * 1000,
        totalMs: 10 * MINUTE + 120 * 1000,
      },
      {
        puzzleName: "third",
        startTime: undefined,
        endTime: undefined,
        running: false,
        elapsedMs: 0,
        penaltyMs: 0,
        totalMs: 0,
      },
    ]);
  });

  it("runs a puzzle's clock while it awaits activation", () => {
    const progress = calculateProgress(
      {
        status: QuestStatus.IN_PROGRESS,
        puzzles: [
          puzzle("first", QuestPuzzleStatus.AWAITING_ACTIVATION, {
            startTime: at(0),
          }),
        ],
      },
      hints,
      at(5)
    );

    expect(progress.puzzles[0]).toMatchObject({
      running: true,
      elapsedMs: 5 * MINUTE,
    });
  });

  it("stops the quest's clock when its last puzzle is solved", () => {
    const progress = calculateProgress(
      {
        status: QuestStatus.COMPLETED,
        puzzles: [
          puzzle("first", QuestPuzzleStatus.COMPLETED, {
            startTime: at(0),
            endTime: at(20),
          }),
          puzzle("second", QuestPuzzleStatus.COMPLETED, {
            startTime: at(20),
            endTime: at(45),
            nextHintToDisplay: 1,
          }),
        ],
      },
      hints,
      at(90)
    );

    expect(progress).toMatchObject({
      startTime: at(0),
      endTime: at(45),
      running: false,
      elapsedMs: 45 * MINUTE,
      penaltyMs: 120 * 1000,
      totalMs: 45 * MINUTE + 120 * 1000,
    });
  });

  it("gives no penalties for a puzzle whose definition was deleted", () => {
    const progress = calculateProgress(
      {
        status: QuestStatus.IN_PROGRESS,
        puzzles: [
          puzzle("deleted", QuestPuzzleStatus.IN_PROGRESS, {
            startTime: at(0),
            nextHintToDisplay: 3,
          }),
        ],
      },
      hints,
      at(1)
    );

    expect(progress.penaltyMs).toBe(0);
  });

  it("measures no time for a completed quest with no recorded end", () => {
    // Possible only if an administrator set the status directly.
    const progress = calculateProgress(
      {
        status: QuestStatus.COMPLETED,
        puzzles: [
          puzzle("first", QuestPuzzleStatus.IN_PROGRESS, { startTime: at(0) }),
        ],
      },
      hints,
      at(10)
    );

    expect(progress).toMatchObject({ running: false, elapsedMs: 0 });
  });

  it("never measures negative time", () => {
    const progress = calculateProgress(
      {
        status: QuestStatus.IN_PROGRESS,
        puzzles: [
          puzzle("first", QuestPuzzleStatus.COMPLETED, {
            startTime: at(10),
            endTime: at(5),
          }),
        ],
      },
      hints,
      at(20)
    );

    expect(progress.puzzles[0].elapsedMs).toBe(0);
  });

  it("measures a quest with no puzzles as no time", () => {
    const progress = calculateProgress(
      { status: QuestStatus.IN_PROGRESS, puzzles: [] },
      hints,
      at(10)
    );

    expect(progress).toMatchObject({
      running: false,
      elapsedMs: 0,
      puzzles: [],
    });
  });

  describe("with pauses", () => {
    // The first puzzle ran from 0 to 30, with a pause from 10 to 15; the
    // second started at 30, and the quest was paused again from 40.
    const pausedQuest = (status = QuestStatus.IN_PROGRESS) => ({
      status,
      pauses: [{ startTime: at(10), endTime: at(15) }, { startTime: at(40) }],
      puzzles: [
        puzzle("first", QuestPuzzleStatus.COMPLETED, {
          startTime: at(0),
          endTime: at(30),
        }),
        puzzle("second", QuestPuzzleStatus.IN_PROGRESS, {
          startTime: at(30),
        }),
      ],
    });

    it("leaves paused time out of each clock it overlaps", () => {
      const progress = calculateProgress(pausedQuest(), hints, at(50));

      expect(progress.puzzles[0].elapsedMs).toBe(25 * MINUTE);
      // 30 to 40; paused since.
      expect(progress.puzzles[1].elapsedMs).toBe(10 * MINUTE);
      // 0 to 50, less 5 and 10 minutes of pauses.
      expect(progress.elapsedMs).toBe(35 * MINUTE);
    });

    it("stops every clock while the quest is paused", () => {
      const progress = calculateProgress(pausedQuest(), hints, at(50));

      expect(progress.running).toBe(false);
      expect(progress.clockStart).toBeUndefined();
      expect(progress.puzzles[1]).toMatchObject({
        running: false,
        clockStart: undefined,
      });
      // Frozen: later, the same time.
      expect(calculateProgress(pausedQuest(), hints, at(90)).elapsedMs).toBe(
        35 * MINUTE
      );
    });

    it("restarts the clocks from where they stopped once the quest resumes", () => {
      const resumed = {
        ...pausedQuest(),
        pauses: [
          { startTime: at(10), endTime: at(15) },
          { startTime: at(40), endTime: at(45) },
        ],
      };

      const progress = calculateProgress(resumed, hints, at(50));

      // 30 to 50, less the pause from 40 to 45.
      expect(progress.puzzles[1]).toMatchObject({
        running: true,
        elapsedMs: 15 * MINUTE,
        clockStart: at(35),
      });
      // 0 to 50, less 10 minutes of pauses; a page's clock counts up from
      // 40 minutes ago.
      expect(progress).toMatchObject({
        running: true,
        elapsedMs: 40 * MINUTE,
        clockStart: at(10),
      });
    });

    it("ignores pauses outside a clock's span", () => {
      const progress = calculateProgress(
        {
          status: QuestStatus.IN_PROGRESS,
          pauses: [{ startTime: at(0), endTime: at(5) }],
          puzzles: [
            puzzle("first", QuestPuzzleStatus.IN_PROGRESS, {
              startTime: at(10),
            }),
          ],
        },
        hints,
        at(20)
      );

      expect(progress.puzzles[0].elapsedMs).toBe(10 * MINUTE);
    });
  });

  it("leaves refunded hints out of the penalties", () => {
    const progress = calculateProgress(
      {
        status: QuestStatus.IN_PROGRESS,
        puzzles: [
          puzzle("first", QuestPuzzleStatus.IN_PROGRESS, {
            startTime: at(0),
            nextHintToDisplay: 2,
            penaltyFreeHints: 1,
          }),
        ],
      },
      hints,
      at(10)
    );

    // Only the second hint, of 300 seconds, counts.
    expect(progress.penaltyMs).toBe(300 * 1000);
  });
});
