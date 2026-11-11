// The values of the API's quest and stop statuses that screens act on.
import type { Schemas } from "@puzzlequest/api-client";

type QuestStatus = Schemas["QuestStatus"];
type StopStatus = Schemas["StopStatus"];

export const QUEST_NOT_STARTED: QuestStatus = "notStarted";
export const QUEST_COMPLETED: QuestStatus = "completed";

export const STEP_NOT_REACHED: StopStatus = "notReached";
export const STEP_AWAITING_ACTIVATION: StopStatus = "awaitingActivation";
export const STEP_IN_PROGRESS: StopStatus = "inProgress";
export const STEP_COMPLETED: StopStatus = "completed";
