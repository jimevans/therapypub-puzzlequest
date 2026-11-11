import { z } from "zod";
import type { PuzzleDefinition } from "../services/puzzle.service.js";
import {
  type ApiPuzzleType,
  puzzleTypeSchema,
  toStoredPuzzleType,
} from "./enums.js";
import { displayName, newName, requiredText, wholeNumber } from "./common.js";

/** A puzzle's hint. The puzzle editor sends the time penalty as text. */
const hint = z.object({
  text: z.string(),
  solutionWarning: z.boolean().default(false).meta({
    description: "True if the hint gives the solution away.",
  }),
  timePenaltySeconds: wholeNumber
    .min(0, "Must not be negative")
    .default(0)
    .meta({
      description: "Seconds added to the players' time for revealing it.",
    }),
});

/** The fields of a puzzle that can be set. */
const puzzleFields = {
  displayName: displayName,
  type: puzzleTypeSchema,
  text: z.string().meta({
    description:
      "Markdown, for a text puzzle; the media file's path, for the others.",
  }),
  solutionKeyword: requiredText.meta({
    description:
      "The keywords a guess must contain, separated by commas; letter case, spacing, and punctuation don't matter.",
  }),
  solutionText: requiredText.meta({
    description: "The solution as shown once it is solved.",
  }),
  hints: z.array(hint),
};

/** A puzzle's fields as a request gives them, in the API's names. */
interface PuzzleFieldsInput {
  displayName?: string;
  type?: ApiPuzzleType;
  text?: string;
  solutionKeyword?: string;
  solutionText?: string;
  hints?: z.output<typeof hint>[];
}

/**
 * Maps a request's puzzle fields to the names and values the puzzle is stored
 * with; fields left out stay out.
 * @param fields the fields, in the API's names
 * @returns the fields, as stored
 */
function toStoredFields({
  type,
  solutionText,
  hints,
  ...same
}: PuzzleFieldsInput): Partial<Omit<PuzzleDefinition, "name">> {
  return {
    ...same,
    ...(type !== undefined ? { type: toStoredPuzzleType(type) } : {}),
    ...(solutionText !== undefined
      ? { solutionDisplayText: solutionText }
      : {}),
    ...(hints !== undefined
      ? {
          hints: hints.map(({ timePenaltySeconds, ...rest }) => ({
            ...rest,
            timePenalty: timePenaltySeconds,
          })),
        }
      : {}),
  };
}

/** POST /api/v1/puzzles */
export const createPuzzleBody = z
  .object({
    puzzleName: newName,
    ...puzzleFields,
    displayName: displayName.default(""),
    type: puzzleTypeSchema.default("text"),
    text: puzzleFields.text.default(""),
    hints: z.array(hint).default([]),
  })
  .transform(
    ({ puzzleName, ...fields }) =>
      ({ name: puzzleName, ...toStoredFields(fields) }) as PuzzleDefinition
  );
export type CreatePuzzleBody = z.output<typeof createPuzzleBody>;

/** PATCH /api/v1/puzzles/{puzzleName}. Fields left out keep their stored values. */
export const updatePuzzleBody = z
  .object(puzzleFields)
  .partial()
  .transform(toStoredFields);
export type UpdatePuzzleBody = z.output<typeof updatePuzzleBody>;
