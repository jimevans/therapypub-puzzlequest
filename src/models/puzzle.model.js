import { Schema, model } from "mongoose";

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
  resourcePath: {
    type: String,
    default: "",
  },
  hints: [hintSchema],
});

const PuzzleModel = model("Puzzle", puzzleSchema);

export { PuzzleModel, PuzzleType };
