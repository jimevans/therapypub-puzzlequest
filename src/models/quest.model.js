import { Schema, model } from 'mongoose';

const QuestStatus = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  COMPLETED: 2
}

const QuestPuzzleStatus = {
  UNAVAILABLE: 0,
  AWAITING_ACTIVATION: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3
}

const questPuzzleSchema = new Schema({
  puzzleName: {
    type: String,
    required: true
  },
  questOrder: {
    type: Number,
    required: true,
    default: 0
  },
  nextHintToDisplay: {
    type: Number,
    required: true,
    default: 0
  },
  status: {
    type: Number,
    required: true,
    default: 0
  },
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
  },
  activationTime: {
    type: Date
  }
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
    default: ""
  },
  userName: {
    type: String,
    required: true
  },
  status: {
    type: Number,
    required: true,
    default: 0
  },
  puzzles: [questPuzzleSchema]
});

const QuestModel = model('Quest', questSchema);
const QuestPuzzleModel = model('QuestPuzzle', questPuzzleSchema);

export { QuestModel, QuestPuzzleModel, QuestStatus, QuestPuzzleStatus }

