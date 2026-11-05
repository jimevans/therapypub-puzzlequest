import { QuestEventModel } from "../models/questEvent.model.js";
import type { PublishedQuestEvent, QuestActivity } from "./questEventBus.js";

/**
 * Gets the details of an event that are worth keeping in the log. Text shown
 * on players' screens is left out; it can be found from the puzzle.
 * @param event the event
 * @returns the details, or undefined if there are none
 */
function eventData(event: PublishedQuestEvent): object | undefined {
  if (event.type === "HintRevealed") {
    return { hintIndex: event.hintIndex, timePenalty: event.timePenalty };
  }
  if (event.type === "PuzzleReset") {
    return { refundedHints: event.refundedHints };
  }
  return undefined;
}

/**
 * Appends quest activity to the quest event log.
 * @param activity the activity
 */
export async function recordQuestActivity(
  activity: QuestActivity
): Promise<void> {
  await QuestEventModel.insertMany(
    activity.events.map((event) => ({
      questName: activity.questName,
      type: event.type,
      puzzleName: "puzzleName" in event ? event.puzzleName : undefined,
      at: event.at,
      actor: activity.actor,
      data: eventData(event),
    }))
  );
}
