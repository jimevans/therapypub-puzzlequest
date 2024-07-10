import { Schema, model } from "mongoose";

/**
 * @typedef {object} QuestPuzzle A puzzle that is assigned as part of a quest.
 * @property {string} puzzleName the unique name of the puzzle
 * @property {number} nextHintToDisplay the index into the puzzle's hint array that indicates the next hint to be displayed
 * @property {number} status the status of the puzzle within the quest
 * @property {Date} startTime the date and time when the puzzle was started
 * @property {Date} endTime the date and time when the puzzle was solved
 * @property {Date} activationTime the date and time when the puzzle was activated
 */

/**
 * @typedef {object} Quest A quest containing puzzles.
 * @property {string} name the unique name of the quest
 * @property {string} displayName the display name of the quest
 * @property {string} userName the user name or team name for which the quest is defined
 * @property {number} status the status of the quest
 * @property {QuestPuzzle[]} puzzles the puzzles that are part of the quest
 */

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
