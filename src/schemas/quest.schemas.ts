import { z } from "zod";
import { AssigneeKind } from "../models/quest.model.js";
import { displayName, newName, requiredText, wholeNumber } from "./common.js";

/**
 * A puzzle in a quest's list. An activation code may be given to set or
 * change the puzzle's code; otherwise one is generated. Progress isn't
 * accepted: it changes only through the game's actions.
 */
const questPuzzle = z.object({
  puzzleName: requiredText,
  activationCode: z.string().optional(),
});

/** The user or team a quest is assigned to, by name. */
const assignee = z.object({
  kind: z.enum(AssigneeKind),
  name: requiredText,
});

/** POST /api/v1/quests */
export const createQuestBody = z.object({
  name: newName,
  displayName: displayName.min(1, "Required"),
  assignee,
  puzzles: z.array(questPuzzle).default([]),
});
export type CreateQuestBody = z.infer<typeof createQuestBody>;

/**
 * PATCH /api/v1/quests/{name}. Fields left out keep their stored values; leaving
 * out the puzzle list keeps the puzzles unchanged.
 */
export const updateQuestBody = z.object({
  displayName: displayName.optional(),
  assignee: assignee.optional(),
  puzzles: z.array(questPuzzle).optional(),
});
export type UpdateQuestBody = z.infer<typeof updateQuestBody>;

/**
 * The page's live-update connection, which the live update about the action
 * then leaves out: the page shows the result itself.
 */
const connectionId = z.string().optional().meta({
  description:
    "The page's live-update connection, which isn't sent the update about this action.",
});

/**
 * POST /api/v1/quests/{name}/puzzles/{puzzleName}/activation: an activation
 * code, or (as multipart, parsed by multer) a camera frame of its QR code
 * with the frame's size.
 */
export const activatePuzzleBody = z.object({
  activationCode: z
    .string()
    .optional()
    .meta({ description: "The code, typed; or scan its QR code instead." }),
  width: wholeNumber
    .positive()
    .optional()
    .meta({ description: "The scanned frame's width, in pixels." }),
  height: wholeNumber
    .positive()
    .optional()
    .meta({ description: "The scanned frame's height, in pixels." }),
});
export type ActivatePuzzleBody = z.infer<typeof activatePuzzleBody>;

/** POST /api/v1/quests/{name}/puzzles/{puzzleName}/solution-attempts */
export const solvePuzzleBody = z.object({
  guess: z.string().max(1000, "Must be at most 1000 characters"),
  connectionId,
});
export type SolvePuzzleBody = z.infer<typeof solvePuzzleBody>;

/** POST /api/v1/quests/{name}/puzzles/{puzzleName}/hints */
export const requestHintBody = z.object({ connectionId });
export type RequestHintBody = z.infer<typeof requestHintBody>;

/** POST /api/v1/quests/{name}/puzzles/{puzzleName}/reset */
export const resetPuzzleBody = z.object({
  /** True to remove the penalties of the puzzle's revealed hints. */
  refundHints: z.boolean().default(false),
});
export type ResetPuzzleBody = z.infer<typeof resetPuzzleBody>;
