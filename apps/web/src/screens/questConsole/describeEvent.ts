import type { Schemas } from "@puzzlequest/api-client";
import { formatDuration } from "../../quests/clock";

type QuestEvent = Schemas["QuestEvent"];

/**
 * Says what happened, in words, for the activity log.
 * @param event what the event log recorded
 * @param puzzleLabel names a puzzle by its name, as the quest shows it
 * @returns the description, such as "Riddle solved"
 */
export function describeEvent(
  event: QuestEvent,
  puzzleLabel: (puzzleName: string) => string
): string {
  const puzzle = event.puzzleName ? puzzleLabel(event.puzzleName) : "A puzzle";
  const data = event.data ?? {};
  switch (event.type) {
    case "QuestStarted":
      return "Quest started";
    case "PuzzleStarted":
      return `${puzzle} is next, waiting to be activated`;
    case "PuzzleActivated":
      return `${puzzle} activated`;
    case "PuzzleSolved":
      return `${puzzle} solved`;
    case "HintRevealed": {
      const hint =
        typeof data.hintIndex === "number" ? ` ${data.hintIndex + 1}` : "";
      const penalty =
        typeof data.timePenalty === "number" && data.timePenalty > 0
          ? `, adding ${formatDuration(data.timePenalty * 1000)}`
          : "";
      return `Hint${hint} revealed on ${puzzle}${penalty}`;
    }
    case "QuestCompleted":
      return "Quest finished";
    case "PuzzleSkipped":
      return `${puzzle} skipped`;
    case "PuzzleReset":
      return typeof data.refundedHints === "number" && data.refundedHints > 0
        ? `${puzzle} reset, refunding ${data.refundedHints === 1 ? "1 hint's penalty" : `${data.refundedHints} hints' penalties`}`
        : `${puzzle} reset`;
    case "QuestPaused":
      return "Quest paused";
    case "QuestResumed":
      return "Quest resumed";
    case "QuestReset":
      return "Quest reset";
    default:
      return event.puzzleName ? `${event.type}: ${puzzle}` : event.type;
  }
}
