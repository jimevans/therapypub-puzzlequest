import { Schema, model } from "mongoose";

/**
 * @typedef {object} Puzzle A puzzle definition.
 * @property {string} name the unique name of the puzzle
 * @property {string} displayName the display name or title of the puzzle
 * @property {number} type the type of the puzzle
 * @property {string} text the text containing the definition of the puzzle
 * @property {string} solutionKeyword a comma-delimited string that solutions must contain
 * @property {string} solutionDisplayText the text shown as the solution to the puzzle
 * @property {Hint[]} hints an array of hints defined for the puzzle
 */

/**
 * @typedef {object} Hint A hint for a puzzle.
 * @property {string} text the text of the hint
 * @property {boolean} solutionWarning true if revealing this hint would substantially reveal the puzzle solution; otherwise, false
 * @property {number} timePenalty the time penalty in seconds when the hint is used by a user
 */

const PuzzleType = {
  TEXT: 0,
  IMAGE: 1,
  AUDIO: 2,
  VIDEO: 3,
}

const hintSchema = new Schema({
  text: {
    type: String,
    default: "",
    required: true,
  },
  solutionWarning: {
    type: Boolean,
    required: true,
    default: false,
  },
  timePenalty: {
    type: Number,
    required: true,
    default: 0,
  },
});

const puzzleSchema = new Schema({
  name: {
    type: String,
    default: "",
    required: true,
    unique: true,
  },
  displayName: {
    type: String,
    default: true,
  },
  type: {
    type: Number,
    default: 0,
  },
  text: {
    type: String,
    default: "",
  },
  solutionKeyword: {
    type: String,
    default: "",
    required: true,
  },
  solutionDisplayText: {
    type: String,
    default: "",
    required: true,
  },
  hints: [hintSchema],
});

const PuzzleModel = model("Puzzle", puzzleSchema);

export { PuzzleModel, PuzzleType };
