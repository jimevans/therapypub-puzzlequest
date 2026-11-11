// The API's enumerated values, as the API names them, and how they map to the
// values stored in the database. The API's values are camelCase strings; the
// database keeps the numbers and names it always has, so nothing stored
// changes: each value is mapped here, at the API's boundary, both ways.
import { z } from "zod";
import { PuzzleType as StoredPuzzleType } from "../models/puzzle.model.js";
import { QuestPuzzleStatus, QuestStatus } from "../models/quest.model.js";
import type { AssigneeKind } from "../models/quest.model.js";
import { AuthorizationLevel } from "../models/user.model.js";

/** How far an entry has got through its quest, by stored status. */
const QUEST_STATUSES = ["notStarted", "inProgress", "completed"] as const;

export const questStatusSchema = z.enum(QUEST_STATUSES).meta({
  id: "QuestStatus",
  description:
    "How far the entry has got through the quest: notStarted, inProgress (which includes paused; see paused), or completed.",
});
export type ApiQuestStatus = z.infer<typeof questStatusSchema>;

/**
 * Names a stored quest status.
 * @param status the stored status (see QuestStatus)
 * @returns the API's value
 */
export function toQuestStatus(status: number): ApiQuestStatus {
  return QUEST_STATUSES[status] ?? QUEST_STATUSES[QuestStatus.NOT_STARTED];
}

/** How far an entry has got with one of its quest's stops, by stored status. */
const STOP_STATUSES = [
  "notReached",
  "awaitingActivation",
  "inProgress",
  "completed",
] as const;

export const stopStatusSchema = z.enum(STOP_STATUSES).meta({
  id: "StopStatus",
  description:
    "How far the entry has got with the stop: notReached; awaitingActivation, when its players are to find it and activate it; inProgress, once activated, while they solve it; or completed, when solved or skipped (see skipped).",
});
export type ApiStopStatus = z.infer<typeof stopStatusSchema>;

/**
 * Names a stored stop status.
 * @param status the stored status (see QuestPuzzleStatus)
 * @returns the API's value
 */
export function toStopStatus(status: number): ApiStopStatus {
  return STOP_STATUSES[status] ?? STOP_STATUSES[QuestPuzzleStatus.UNAVAILABLE];
}

/** What a puzzle shows, by stored type. */
const PUZZLE_TYPES = ["text", "image", "audio", "video"] as const;

export const puzzleTypeSchema = z
  .enum(PUZZLE_TYPES, { error: "Must be a known puzzle type" })
  .meta({
    id: "PuzzleType",
    description:
      "What the puzzle shows: text (its text is Markdown), or an image, audio, or video file (its text is the file's path).",
  });
export type ApiPuzzleType = z.infer<typeof puzzleTypeSchema>;

/**
 * Names a stored puzzle type.
 * @param type the stored type (see PuzzleType)
 * @returns the API's value
 */
export function toPuzzleType(type: number): ApiPuzzleType {
  return PUZZLE_TYPES[type] ?? "text";
}

/**
 * Gets the stored puzzle type for the API's value.
 * @param type the API's value
 * @returns the stored type
 */
export function toStoredPuzzleType(type: ApiPuzzleType): StoredPuzzleType {
  return PUZZLE_TYPES.indexOf(type) as StoredPuzzleType;
}

export const roleSchema = z
  .enum(["player", "staff", "admin"], { error: "Must be a known role" })
  .meta({
    id: "Role",
    description:
      "What the user may do: a player plays the quests they're entered in; staff also follow every quest and show the players its stops' activation codes; an administrator manages everything.",
  });
export type Role = z.infer<typeof roleSchema>;

/**
 * Names a stored authorization level.
 * @param level the stored level (see AuthorizationLevel)
 * @returns the user's role
 */
export function toRole(level: number): Role {
  if (level >= AuthorizationLevel.ADMIN) {
    return "admin";
  }
  return level >= AuthorizationLevel.STAFF ? "staff" : "player";
}

/**
 * Gets the stored authorization level for a role.
 * @param role the role
 * @returns the stored level
 */
export function toAuthorizationLevel(role: Role): AuthorizationLevel {
  return {
    player: AuthorizationLevel.USER,
    staff: AuthorizationLevel.STAFF,
    admin: AuthorizationLevel.ADMIN,
  }[role];
}

export const entrantKindSchema = z
  .enum(["player", "team"], { error: "Must be player or team" })
  .meta({
    id: "EntrantKind",
    description:
      "Who plays the entry: a player on their own, or a team. A player's name is their user name; a team's, its team name.",
  });
export type EntrantKind = z.infer<typeof entrantKindSchema>;

/**
 * Names a stored assignee kind.
 * @param kind the stored kind
 * @returns the API's value
 */
export function toEntrantKind(kind: AssigneeKind): EntrantKind {
  return kind === "user" ? "player" : "team";
}

/**
 * Gets the stored assignee kind for the API's value.
 * @param kind the API's value
 * @returns the stored kind
 */
export function toAssigneeKind(kind: EntrantKind): AssigneeKind {
  return kind === "player" ? "user" : "team";
}

/** What can happen in a quest, as its event log records it. */
const QUEST_EVENT_TYPES = [
  "questStarted",
  "puzzleStarted",
  "puzzleActivated",
  "puzzleSolved",
  "hintRevealed",
  "questCompleted",
  "puzzleSkipped",
  "puzzleReset",
  "questPaused",
  "questResumed",
  "questReset",
] as const;

export const questEventTypeSchema = z.enum(QUEST_EVENT_TYPES).meta({
  id: "QuestEventType",
  description: "What happened.",
});
export type QuestEventType = z.infer<typeof questEventTypeSchema>;

/**
 * Names a stored event type, such as PuzzleSolved, as the API does:
 * puzzleSolved.
 * @param type the stored type
 * @returns the API's value
 */
export function toQuestEventType(type: string): QuestEventType {
  return `${type.charAt(0).toLowerCase()}${type.slice(1)}` as QuestEventType;
}
