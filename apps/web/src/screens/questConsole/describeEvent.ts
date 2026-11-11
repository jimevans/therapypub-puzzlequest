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
    case "questStarted":
      return "Quest started";
    case "puzzleStarted":
      return `${puzzle} is next, waiting to be activated`;
    case "puzzleActivated":
      return `${puzzle} activated`;
    case "puzzleSolved":
      return `${puzzle} solved`;
    case "hintRevealed": {
      const hint =
        typeof data.hintIndex === "number" ? ` ${data.hintIndex + 1}` : "";
      const penalty =
        typeof data.timePenaltySeconds === "number" &&
        data.timePenaltySeconds > 0
          ? `, adding ${formatDuration(data.timePenaltySeconds * 1000)}`
          : "";
      return `Hint${hint} revealed on ${puzzle}${penalty}`;
    }
    case "questCompleted":
      return "Quest finished";
    case "puzzleSkipped":
      return `${puzzle} skipped`;
    case "puzzleReset":
      return typeof data.refundedHints === "number" && data.refundedHints > 0
        ? `${puzzle} reset, refunding ${data.refundedHints === 1 ? "1 hint's penalty" : `${data.refundedHints} hints' penalties`}`
        : `${puzzle} reset`;
    case "questPaused":
      return "Quest paused";
    case "questResumed":
      return "Quest resumed";
    case "questReset":
      return "Quest reset";
    default:
      return event.puzzleName ? `${event.type}: ${puzzle}` : event.type;
  }
}
