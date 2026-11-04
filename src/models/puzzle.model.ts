import { type InferSchemaType, Schema, model } from "mongoose";
import { organizationField } from "./organization.model.js";

/** The kind of content a puzzle has. */
export const PuzzleType = {
  TEXT: 0,
  IMAGE: 1,
  AUDIO: 2,
  VIDEO: 3,
} as const;
export type PuzzleType = (typeof PuzzleType)[keyof typeof PuzzleType];

/** A hint for a puzzle. */
const hintSchema = new Schema({
  /** The text of the hint. */
  text: {
    type: String,
    default: "",
    required: true,
  },
  /** True if revealing this hint would largely give away the solution. */
  solutionWarning: {
    type: Boolean,
    required: true,
    default: false,
  },
  /** The time penalty, in seconds, for using the hint. */
  timePenalty: {
    type: Number,
    required: true,
    default: 0,
  },
});

/** A puzzle definition. */
const puzzleSchema = new Schema({
  /** The organization the puzzle belongs to. */
  organizationId: organizationField,
  /** The unique name of the puzzle. */
  name: {
    type: String,
    default: "",
    required: true,
  },
  /** The display name or title of the puzzle. */
  displayName: {
    type: String,
    default: true,
  },
  /** The kind of content the puzzle has (see PuzzleType). */
  type: {
    type: Number,
    default: 0,
  },
  /**
   * The puzzle's content: Markdown for a text puzzle, or the path of the
   * media file for an image, audio, or video puzzle.
   */
  text: {
    type: String,
    default: "",
  },
  /** Comma-separated keywords that a correct solution must contain. */
  solutionKeyword: {
    type: String,
    default: "",
    required: true,
  },
  /** The text shown as the solution to the puzzle. */
  solutionDisplayText: {
    type: String,
    default: "",
    required: true,
  },
  /** The hints for the puzzle, in the order they are revealed. */
  hints: [hintSchema],
});

// Puzzle names are unique within an organization.
puzzleSchema.index({ organizationId: 1, name: 1 }, { unique: true });

/** A puzzle hint as stored in the database. */
export type HintData = InferSchemaType<typeof hintSchema>;

/** A puzzle as stored in the database. */
export type PuzzleData = InferSchemaType<typeof puzzleSchema>;

export const PuzzleModel = model("Puzzle", puzzleSchema);
