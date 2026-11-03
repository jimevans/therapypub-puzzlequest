import * as WebSocketService from "../services/websocket.service.js";
import type { QuestActivity } from "./questEventBus.js";

/**
 * Gets the paths of the pages that show a puzzle's progress: the quest page,
 * the puzzle page, and their monitor views.
 * @param questName the name of the quest
 * @param puzzleName the name of the puzzle
 * @returns the page paths
 */
function puzzlePages(questName: string, puzzleName: string): string[] {
  return [
    `/quest/${questName}`,
    `/quest/${questName}/puzzle/${puzzleName}`,
    `/monitor/quest/${questName}`,
    `/monitor/quest/${questName}/puzzle/${puzzleName}`,
  ];
}

/**
 * Sends quest activity to the browsers showing the quest, except the one the
 * action came from, so every player and monitor sees progress as it happens.
 * Starting and resetting quests send nothing; the pages for a quest that
 * hasn't started don't listen for updates.
 * @param activity the activity
 */
export function sendLiveUpdates(activity: QuestActivity): void {
  const { questName } = activity;
  const exclude = activity.connectionId ? [activity.connectionId] : [];
  const notify = (pages: string[], data: object) =>
    WebSocketService.notifyBrowsers(pages, exclude, data);

  const solved = activity.events.find((event) => event.type === "PuzzleSolved");
  const questComplete = activity.events.some(
    (event) => event.type === "QuestCompleted"
  );
  for (const event of activity.events) {
    switch (event.type) {
      case "PuzzleActivated":
        notify(puzzlePages(questName, event.puzzleName), {
          message: "puzzleActivated",
          questName,
          puzzleName: event.puzzleName,
          activationTime: event.at,
        });
        break;
      case "PuzzleSolved":
        notify(puzzlePages(questName, event.puzzleName), {
          message: "puzzleSolved",
          questName,
          puzzleName: event.puzzleName,
          solutionText: event.solutionText,
          endTime: event.at,
          questComplete: questComplete || undefined,
        });
        break;
      case "PuzzleStarted":
        // Sent to the pages of the puzzle just solved, which are the ones
        // players have open; no page shows a puzzle before it starts.
        if (solved) {
          notify(puzzlePages(questName, solved.puzzleName), {
            message: "puzzleStarted",
            questName,
            puzzleName: event.puzzleName,
            displayName: event.displayName,
            startTime: event.at,
          });
        }
        break;
      case "HintRevealed":
        notify(
          [
            `/quest/${questName}/puzzle/${event.puzzleName}`,
            `/monitor/quest/${questName}/puzzle/${event.puzzleName}`,
          ],
          {
            message: "hintRequested",
            hintText: event.hintText,
            moreHints: event.moreHints,
            timePenalty: event.timePenalty,
            isNextHintSolution: event.isNextHintSolution,
          }
        );
        break;
    }
  }
}
