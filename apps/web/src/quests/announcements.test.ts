import { describe, expect, it } from "vitest";
import {
  type ProgressSnapshot,
  type PuzzleSnapshot,
  describeProgress,
  describePuzzle,
  progressSnapshot,
} from "./announcements";

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
  status: 2,
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
    expect(describePuzzle(puzzle({ status: 1 }), puzzle())).toBe(
      "The puzzle is started."
    );
    expect(
      describePuzzle(puzzle(), puzzle({ status: 3, solutionText: "A piano" }))
    ).toBe("Solved: A piano.");
  });

  it("says when the puzzle master skips it", () => {
    expect(describePuzzle(puzzle(), puzzle({ status: 3, skipped: true }))).toBe(
      "Skipped by the puzzle master."
    );
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
  it("has only the steps reached, by whichever name the view has", () => {
    expect(
      progressSnapshot({ paused: true, status: 1 }, [
        { puzzleName: "riddle", displayName: "The Riddle", status: 3 },
        { puzzleName: "cipher", status: 2 },
        { puzzleName: "finale", displayName: "The Finale", status: 0 },
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
