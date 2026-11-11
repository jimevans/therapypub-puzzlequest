import { QuestEventModel } from "../models/questEvent.model.js";
import { TeamModel, UserModel } from "../models/user.model.js";
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
 * Looks up the name of the user or team playing an entry, as the log keeps
 * it: as history, as it is now.
 * @param assignee the user or team
 * @returns the entrant, with its name unless it has been deleted
 */
async function entrantOf(
  assignee: QuestActivity["entry"]["assignee"]
): Promise<{ kind: "user" | "team"; name?: string }> {
  const name =
    assignee.kind === "user"
      ? (await UserModel.findById(assignee.id, { userName: 1 }).lean())
          ?.userName
      : (await TeamModel.findById(assignee.id, { teamName: 1 }).lean())
          ?.teamName;
  return { kind: assignee.kind, ...(name ? { name } : {}) };
}

/**
 * Appends quest activity to the quest event log.
 * @param activity the activity
 */
export async function recordQuestActivity(
  activity: QuestActivity
): Promise<void> {
  const entrant = await entrantOf(activity.entry.assignee);
  await QuestEventModel.insertMany(
    activity.events.map((event) => ({
      questName: activity.questName,
      entrant,
      type: event.type,
      puzzleName: "puzzleName" in event ? event.puzzleName : undefined,
      at: event.at,
      actor: activity.actor,
      data: eventData(event),
    }))
  );
}
