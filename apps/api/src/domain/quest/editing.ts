import { QuestPuzzleStatus, type QuestState, QuestStatus } from "./state.js";

/** Whether a quest's puzzle list may be changed, and if not, why. */
export type PuzzleListCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: "QUEST_COMPLETED" }
  | {
      readonly ok: false;
      readonly error: "REACHED_PUZZLE_CHANGED";
      /** The reached puzzle that would be moved or removed. */
      readonly puzzleName: string;
    };

/**
 * Checks a new puzzle list for a quest. Before the quest starts, anything
 * goes. Once it has started, the puzzles the players have reached must stay
 * where they are, at the start of the list; only the puzzles after them can
 * be added, removed, or reordered. Once it is completed, the list can't
 * change until the quest is reset.
 * @param state the quest
 * @param puzzleNames the new list of puzzle names, in order
 * @returns whether the change is allowed
 */
export function checkPuzzleListChange(
  state: QuestState,
  puzzleNames: readonly string[]
): PuzzleListCheck {
  if (state.status === QuestStatus.NOT_STARTED) {
    return { ok: true };
  }
  if (state.status === QuestStatus.COMPLETED) {
    const unchanged =
      puzzleNames.length === state.puzzles.length &&
      state.puzzles.every(
        (puzzle, index) => puzzle.puzzleName === puzzleNames[index]
      );
    return unchanged ? { ok: true } : { ok: false, error: "QUEST_COMPLETED" };
  }
  // Reached puzzles always come first: each one is reached only after the
  // one before it is solved.
  const moved = state.puzzles
    .filter((puzzle) => puzzle.status !== QuestPuzzleStatus.UNAVAILABLE)
    .find((puzzle, index) => puzzleNames[index] !== puzzle.puzzleName);
  return moved
    ? {
        ok: false,
        error: "REACHED_PUZZLE_CHANGED",
        puzzleName: moved.puzzleName,
      }
    : { ok: true };
}
