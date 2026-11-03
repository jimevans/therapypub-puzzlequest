import { z } from "zod";
import { PuzzleType } from "../models/puzzle.model.js";
import { displayName, newName, requiredText, wholeNumber } from "./common.js";

/** A puzzle's hint. The puzzle editor sends the time penalty as text. */
const hint = z.object({
  text: z.string(),
  solutionWarning: z.boolean().default(false),
  timePenalty: wholeNumber.min(0, "Must not be negative").default(0),
});

const puzzleType = z
  .number()
  .int()
  .refine(
    (type) => (Object.values(PuzzleType) as number[]).includes(type),
    "Must be a known puzzle type"
  );

/** The fields of a puzzle that can be set. */
const puzzleFields = {
  displayName: displayName,
  type: puzzleType,
  /** Markdown for a text puzzle; the media file's path otherwise. */
  text: z.string(),
  solutionKeyword: requiredText,
  solutionDisplayText: requiredText,
  hints: z.array(hint),
};

/** POST /api/puzzle/create */
export const createPuzzleBody = z.object({
  name: newName,
  ...puzzleFields,
  displayName: displayName.default(""),
  type: puzzleType.default(PuzzleType.TEXT),
  text: z.string().default(""),
  hints: z.array(hint).default([]),
});
export type CreatePuzzleBody = z.infer<typeof createPuzzleBody>;

/** PUT /api/puzzle/:name. Fields left out keep their stored values. */
export const updatePuzzleBody = z.object(puzzleFields).partial();
export type UpdatePuzzleBody = z.infer<typeof updatePuzzleBody>;
