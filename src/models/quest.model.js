import { Schema, model } from "mongoose";

const QuestStatus = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  COMPLETED: 2,
};

const QuestPuzzleStatus = {
  UNAVAILABLE: 0,
  AWAITING_ACTIVATION: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3,
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

questPuzzleSchema.virtual("statusDescription")
  .get(function () {
    switch (this.status) {
      case QuestPuzzleStatus.AWAITING_ACTIVATION:
        return "Awaiting activation";
      case QuestPuzzleStatus.IN_PROGRESS:
        return "In progress";
      case QuestPuzzleStatus.COMPLETED:
        return "Completed";
    }
    return "Unavailable";
  });

questPuzzleSchema.set("toJSON", { virtuals: true });

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

questSchema.virtual("statusDescription")
  .get(function () {
    switch (this.status) {
      case QuestStatus.NOT_STARTED:
        return "Not yet started";
      case QuestStatus.IN_PROGRESS:
        return "In progress";
      case QuestStatus.COMPLETED:
        return "Completed";
    }
    return "Unavailable";
  });

questSchema.set("toJSON", { virtuals: true });


const QuestModel = model("Quest", questSchema);
const QuestPuzzleModel = model("QuestPuzzle", questPuzzleSchema);

export { QuestModel, QuestPuzzleModel, QuestStatus, QuestPuzzleStatus };
