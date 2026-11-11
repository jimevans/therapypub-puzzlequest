import { describe, expect, it } from "vitest";
import {
  type ProgressSnapshot,
  type PuzzleSnapshot,
  describeProgress,
  describePuzzle,
  progressSnapshot,
} from "./announcements";
import { describeEntries, entriesSnapshot } from "./entryAnnouncements";

const progress = (
  fields: Partial<ProgressSnapshot> = {}
): ProgressSnapshot => ({
  paused: false,
  finished: false,
  steps: [{ name: "riddle", displayName: "The Riddle", solved: false }],
  ...fields,
});

const puzzle = (fields: Partial<PuzzleSnapshot> = {}): PuzzleSnapshot => ({
  paused: false,
  status: "inProgress",
  skipped: false,
  solutionText: null,
  hints: [],
  questFinished: false,
  ...fields,
});

describe("announcing a quest's progress", () => {
  it("says nothing when nothing worth saying changed", () => {
    expect(describeProgress(progress(), progress())).toBeNull();
  });

  it("says when a step is solved, and the next reached", () => {
    expect(
      describeProgress(
        progress(),
        progress({
          steps: [
            { name: "riddle", displayName: "The Riddle", solved: true },
            { name: "cipher", displayName: "The Cipher", solved: false },
          ],
        })
      )
    ).toBe("The Riddle is solved. Stop 2 reached: The Cipher.");
  });

  it("says when the quest is paused, resumed, or over", () => {
    expect(describeProgress(progress(), progress({ paused: true }))).toBe(
      "Paused by the puzzle master. The clock is stopped."
    );
    expect(describeProgress(progress({ paused: true }), progress())).toBe(
      "The quest has resumed."
    );
    expect(describeProgress(progress(), progress({ finished: true }))).toBe(
      "End of the line."
    );
  });
});

describe("announcing a puzzle", () => {
  it("says when it's started, and when it's solved, with the solution", () => {
    expect(
      describePuzzle(puzzle({ status: "awaitingActivation" }), puzzle())
    ).toBe("The puzzle is started.");
    expect(
      describePuzzle(
        puzzle(),
        puzzle({ status: "completed", solutionText: "A piano" })
      )
    ).toBe("Solved: A piano.");
  });

  it("says when the puzzle master skips it", () => {
    expect(
      describePuzzle(puzzle(), puzzle({ status: "completed", skipped: true }))
    ).toBe("Skipped by the puzzle master.");
  });

  it("reads out each new hint", () => {
    expect(
      describePuzzle(
        puzzle({ hints: ["Think small"] }),
        puzzle({ hints: ["Think small", "It has keys"] })
      )
    ).toBe("Hint: It has keys");
  });
});

describe("a quest's progress snapshot", () => {
  it("has only the steps reached, named by their puzzles", () => {
    expect(
      progressSnapshot({ paused: true, status: "inProgress" }, [
        {
          puzzleName: "riddle",
          displayName: "The Riddle",
          status: "completed",
        },
        { puzzleName: "cipher", status: "inProgress" },
        {
          puzzleName: "finale",
          displayName: "The Finale",
          status: "notReached",
        },
      ])
    ).toEqual({
      paused: true,
      finished: false,
      steps: [
        { name: "riddle", displayName: "The Riddle", solved: true },
        { name: "cipher", displayName: "cipher", solved: false },
      ],
    });
  });
});

describe("announcing several entries' progress", () => {
  const entry = (id: string, name: string, solved: boolean) => ({
    id,
    name,
    paused: false,
    status: "inProgress" as const,
    steps: [
      {
        puzzleName: "riddle",
        displayName: "The Riddle",
        status: solved ? ("completed" as const) : ("inProgress" as const),
      },
    ],
  });

  it("says whose entry changed, when there are several", () => {
    expect(
      describeEntries(
        entriesSnapshot([
          entry("1", "The Reds", false),
          entry("2", "The Blues", false),
        ]),
        entriesSnapshot([
          entry("1", "The Reds", false),
          entry("2", "The Blues", true),
        ])
      )
    ).toBe("The Blues: The Riddle is solved.");
  });

  it("says it as before when there's only one", () => {
    expect(
      describeEntries(
        entriesSnapshot([entry("1", "The Reds", false)]),
        entriesSnapshot([entry("1", "The Reds", true)])
      )
    ).toBe("The Riddle is solved.");
  });

  it("says nothing of an entry just added, or when nothing changed", () => {
    expect(
      describeEntries(
        entriesSnapshot([entry("1", "The Reds", false)]),
        entriesSnapshot([
          entry("1", "The Reds", false),
          entry("2", "The Blues", true),
        ])
      )
    ).toBeNull();
  });
});
