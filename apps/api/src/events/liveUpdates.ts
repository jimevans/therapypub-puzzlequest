import type { QuestUpdate } from "../schemas/liveUpdates.js";
import * as WebSocketService from "../services/websocket.service.js";
import type { QuestActivity } from "./questEventBus.js";

/**
 * Sends quest activity to the clients following the quest, except the one the
 * action came from, so every player and spectator sees progress as it happens.
 * Starting and resetting quests send nothing: clients see those when they next
 * refresh. An administrator's rescues (pausing, resuming, skipping, and
 * resetting) go to everyone, since they can change much of the quest.
 * @param activity the activity
 */
export function sendLiveUpdates(activity: QuestActivity): void {
  const { questName } = activity;
  const exclude = activity.connectionId ? [activity.connectionId] : [];
  const notify = (update: QuestUpdate) =>
    WebSocketService.notifyQuestFollowers(update, exclude);

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
          puzzleName: event.puzzleName,
          activationTime: event.at.toISOString(),
        });
        break;
      case "PuzzleSolved":
        notify({
          message: "puzzleSolved",
          questName,
          puzzleName: event.puzzleName,
          solutionText: event.solutionText,
          endTime: event.at.toISOString(),
          ...(questComplete ? { questComplete: true as const } : {}),
        });
        break;
      case "PuzzleStarted":
        // Only when a solve leads to it: a quest's first puzzle starts with the
        // quest, which sends nothing.
        if (solved) {
          notify({
            message: "puzzleStarted",
            questName,
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
        });
        break;
      case "HintRevealed":
        notify({
          message: "hintRequested",
          questName,
          puzzleName: event.puzzleName,
          hintText: event.hintText,
          moreHints: event.moreHints,
          timePenalty: event.timePenalty,
          isNextHintSolution: event.isNextHintSolution,
        });
        break;
    }
  }
}
