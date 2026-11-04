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

/** POST /api/quest/create */
export const createQuestBody = z.object({
  name: newName,
  displayName: displayName.min(1, "Required"),
  assignee,
  puzzles: z.array(questPuzzle).default([]),
});
export type CreateQuestBody = z.infer<typeof createQuestBody>;

/**
 * PUT /api/quest/:name. Fields left out keep their stored values; leaving
 * out the puzzle list keeps the puzzles unchanged.
 */
export const updateQuestBody = z.object({
  displayName: displayName.optional(),
  assignee: assignee.optional(),
  puzzles: z.array(questPuzzle).optional(),
});
export type UpdateQuestBody = z.infer<typeof updateQuestBody>;

/** The browser's live-update connection, which the response leaves out. */
const connectionId = z.string().optional();

/**
 * POST /api/quest/:name/puzzle/:puzzleName/activate: an activation code, or
 * an image of its QR code (multipart, parsed by multer) with its size.
 */
export const activatePuzzleBody = z.object({
  activationCode: z.string().optional(),
  width: wholeNumber.positive().optional(),
  height: wholeNumber.positive().optional(),
});
export type ActivatePuzzleBody = z.infer<typeof activatePuzzleBody>;

/** PUT /api/quest/:name/puzzle/:puzzleName/solve */
export const solvePuzzleBody = z.object({
  guess: z.string().max(1000, "Must be at most 1000 characters"),
  connectionId,
});
export type SolvePuzzleBody = z.infer<typeof solvePuzzleBody>;

/** PUT /api/quest/:name/puzzle/:puzzleName/hint */
export const requestHintBody = z.object({ connectionId });
export type RequestHintBody = z.infer<typeof requestHintBody>;

/** PUT /api/quest/:name/puzzle/:puzzleName/reset */
export const resetPuzzleBody = z.object({
  /** True to remove the penalties of the puzzle's revealed hints. */
  refundHints: z.boolean().default(false),
});
export type ResetPuzzleBody = z.infer<typeof resetPuzzleBody>;
