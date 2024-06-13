import { Schema, model } from "mongoose";

const QuestStatus = {
  NOT_STARTED: { value: 0, description: "Not started" },
  IN_PROGRESS: { value: 1, description: "In progress" },
  COMPLETED: { value: 2, description: "Completed" }
};

const QuestPuzzleStatus = {
  UNAVAILABLE: { value: 0, description: "Unavailable" },
  AWAITING_ACTIVATION: { value: 1, description: "Awaiting activation" },
  IN_PROGRESS: { value: 2, description: "In progress" },
  COMPLETED: { value: 3, description: "Completed" }
};

const questPuzzleSchema = new Schema({
  puzzleName: {
    type: String,
    required: true,
  },
  questOrder: {
    type: Number,
    required: true,
    default: 0,
  },
  nextHintToDisplay: {
    type: Number,
    required: true,
    default: 0,
  },
  status: {
    type: Number,
    required: true,
    default: 0,
  },
  startTime: {
    type: Date,
  },
  endTime: {
    type: Date,
  },
  activationTime: {
    type: Date,
  },
});

const questSchema = new Schema({
  name: {
    type: String,
    default: "",
    required: true,
    unique: true,
  },
  displayName: {
    type: String,
    default: "",
  },
  userName: {
    type: String,
    required: true,
  },
  status: {
    type: Number,
    required: true,
    default: 0,
  },
  puzzles: [questPuzzleSchema],
});

const QuestModel = model("Quest", questSchema);
const QuestPuzzleModel = model("QuestPuzzle", questPuzzleSchema);

export { QuestModel, QuestPuzzleModel, QuestStatus, QuestPuzzleStatus };
