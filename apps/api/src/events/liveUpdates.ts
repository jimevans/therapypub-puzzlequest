import { toNextHint } from "../schemas/hints.js";
import type { QuestUpdate } from "../schemas/liveUpdates.js";
import { notifyPlayersOf } from "../services/playerUpdates.service.js";
import * as WebSocketService from "../services/websocket.service.js";
import type { QuestActivity } from "./questEventBus.js";

/**
 * Sends quest activity to the clients following the quest, except the one the
 * action came from, so every player and spectator sees progress as it happens.
 * Starting and resetting quests send nothing: clients see those when they next
 * refresh. An administrator's rescues (pausing, resuming, skipping, and
 * resetting) go to everyone, since they can change much of the quest. Each
 * update names the entry whose progress changed; while teams race, only staff
 * and the entry's own players are sent what changed, and everyone else only
 * that it did.
 * @param activity the activity
 */
export function sendLiveUpdates(activity: QuestActivity): void {
  const { questName } = activity;
  const entryId = activity.entry.id;
  const exclude = activity.connectionId ? [activity.connectionId] : [];
  // While teams race, rivals are told only that the entry changed.
  const audience = {
    racing: activity.racing,
    assigneeId: activity.entry.assignee.id.toString(),
  };
  const notify = (update: QuestUpdate) =>
    WebSocketService.notifyQuestFollowers(update, exclude, audience);

  const solved = activity.events.find((event) => event.type === "PuzzleSolved");
  const questComplete = activity.events.some(
    (event) => event.type === "QuestCompleted"
  );
  for (const event of activity.events) {
    switch (event.type) {
      case "PuzzleActivated":
        notify({
          message: "puzzleActivated",
          questName,
          entryId,
          puzzleName: event.puzzleName,
          activationTime: event.at.toISOString(),
        });
        break;
      case "PuzzleSolved":
        notify({
          message: "puzzleSolved",
          questName,
          entryId,
          puzzleName: event.puzzleName,
          solutionText: event.solutionText,
          endTime: event.at.toISOString(),
          questComplete,
        });
        break;
      case "PuzzleStarted":
        // Only when a solve leads to it: a quest's first puzzle starts with the
        // quest, which sends nothing.
        if (solved) {
          notify({
            message: "puzzleStarted",
            questName,
            entryId,
            puzzleName: event.puzzleName,
            displayName: event.displayName,
            startTime: event.at.toISOString(),
          });
        }
        break;
      case "QuestPaused":
      case "QuestResumed":
      case "PuzzleSkipped":
      case "PuzzleReset":
        WebSocketService.notifyQuestFollowers({
          message: "questUpdated",
          questName,
          entryId,
        });
        break;
      case "HintRevealed":
        notify({
          message: "hintRevealed",
          questName,
          entryId,
          puzzleName: event.puzzleName,
          hintText: event.hintText,
          timePenaltySeconds: event.timePenalty,
          nextHint: toNextHint(event.nextHint),
        });
        break;
    }
  }
}

/**
 * Tells the entry's players that their list of quests changed: every action
 * changes how far along a quest is, and starting one adds it to the list.
 * @param activity the activity
 */
export async function sendPlayerUpdates(
  activity: QuestActivity
): Promise<void> {
  await notifyPlayersOf([activity.entry.assignee]);
}
