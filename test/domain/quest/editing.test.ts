import { describe, expect, it } from "vitest";
import {
  QuestPuzzleStatus,
  type QuestState,
  QuestStatus,
  checkPuzzleListChange,
} from "../../../src/domain/quest/index.js";

/**
 * Builds a quest whose puzzles have the given statuses.
 * @param status the quest's status
 * @param puzzles [puzzle name, status] pairs, in order
 * @returns the quest
 */
function quest(
  status: QuestStatus,
  puzzles: [string, QuestPuzzleStatus][]
): QuestState {
  return {
    status,
    puzzles: puzzles.map(([puzzleName, puzzleStatus]) => ({
      puzzleName,
      status: puzzleStatus,
      nextHintToDisplay: 0,
      activationCode: "code",
    })),
  };
}

const { UNAVAILABLE, AWAITING_ACTIVATION, IN_PROGRESS, COMPLETED } =
  QuestPuzzleStatus;

describe("checkPuzzleListChange", () => {
  describe("before the quest starts", () => {
    const notStarted = quest(QuestStatus.NOT_STARTED, [
      ["a", UNAVAILABLE],
      ["b", UNAVAILABLE],
    ]);

    it.each([
      ["reordered", ["b", "a"]],
      ["shortened", ["b"]],
      ["emptied", []],
      ["extended", ["a", "b", "c"]],
    ])("allows the list to be %s", (_, puzzleNames) => {
      expect(checkPuzzleListChange(notStarted, puzzleNames)).toEqual({
        ok: true,
      });
    });
  });

  describe("while the quest is in progress", () => {
    // a is solved, b is being solved, c and d aren't reached yet.
    const inProgress = quest(QuestStatus.IN_PROGRESS, [
      ["a", COMPLETED],
      ["b", IN_PROGRESS],
      ["c", UNAVAILABLE],
      ["d", UNAVAILABLE],
    ]);

    it.each([
      ["kept as it is", ["a", "b", "c", "d"]],
      ["changed after the reached puzzles", ["a", "b", "d", "e"]],
      ["cut back to the reached puzzles", ["a", "b"]],
    ])("allows the list to be %s", (_, puzzleNames) => {
      expect(checkPuzzleListChange(inProgress, puzzleNames)).toEqual({
        ok: true,
      });
    });

    it.each([
      ["moving a solved puzzle", ["b", "a", "c"], "a"],
      ["removing a solved puzzle", ["b", "c"], "a"],
      ["removing the current puzzle", ["a", "c"], "b"],
      ["putting a puzzle before the current one", ["a", "c", "b"], "b"],
      ["emptying the list", [], "a"],
    ])("refuses %s", (_, puzzleNames, puzzleName) => {
      expect(checkPuzzleListChange(inProgress, puzzleNames)).toEqual({
        ok: false,
        error: "REACHED_PUZZLE_CHANGED",
        puzzleName,
      });
    });

    it("protects a puzzle awaiting activation", () => {
      const awaiting = quest(QuestStatus.IN_PROGRESS, [
        ["a", AWAITING_ACTIVATION],
        ["b", UNAVAILABLE],
      ]);

      expect(checkPuzzleListChange(awaiting, ["b"])).toEqual({
        ok: false,
        error: "REACHED_PUZZLE_CHANGED",
        puzzleName: "a",
      });
    });
  });

  describe("after the quest is completed", () => {
    const completed = quest(QuestStatus.COMPLETED, [
      ["a", COMPLETED],
      ["b", COMPLETED],
    ]);

    it("allows the list to stay as it is", () => {
      expect(checkPuzzleListChange(completed, ["a", "b"])).toEqual({
        ok: true,
      });
    });

    it.each([
      ["extended", ["a", "b", "c"]],
      ["shortened", ["a"]],
      ["reordered", ["b", "a"]],
    ])("refuses to let the list be %s", (_, puzzleNames) => {
      expect(checkPuzzleListChange(completed, puzzleNames)).toEqual({
        ok: false,
        error: "QUEST_COMPLETED",
      });
    });
  });
});
