import { type InferSchemaType, Schema, model } from "mongoose";
import { QuestPuzzleStatus, QuestStatus } from "../domain/quest/state.js";

// The status values are part of the rules of the game, so they live in the
// domain; they are re-exported here for code that already imports them.
export { QuestPuzzleStatus, QuestStatus };

/** A puzzle that is part of a quest, with the quest's progress on it. */
const questPuzzleSchema = new Schema({
  /** The unique name of the puzzle. */
  puzzleName: {
    type: String,
    required: true,
  },
  /** The index in the puzzle's hints of the next hint to reveal. */
  nextHintToDisplay: {
    type: Number,
    required: true,
    default: 0,
  },
  /** The status of the puzzle within the quest (see QuestPuzzleStatus). */
  status: {
    type: Number,
    required: true,
    default: 0,
  },
  /** The code that activates this puzzle in this quest. */
  activationCode: {
    type: String,
    default: "",
    required: true,
  },
  /** When the puzzle became available to activate. */
  startTime: {
    type: Date,
  },
  /** When the puzzle was solved. */
  endTime: {
    type: Date,
  },
  /** When the puzzle was activated. */
  activationTime: {
    type: Date,
  },
});

questPuzzleSchema.virtual("statusDescription").get(function () {
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

/** A quest: a sequence of puzzles assigned to a user or a team. */
const questSchema = new Schema(
  {
    /** The unique name of the quest. */
    name: {
      type: String,
      default: "",
      required: true,
      unique: true,
    },
    /** The display name of the quest. */
    displayName: {
      type: String,
      default: "",
    },
    /** The user name or team name the quest is assigned to. */
    userName: {
      type: String,
      required: true,
    },
    /** The status of the quest (see QuestStatus). */
    status: {
      type: Number,
      required: true,
      default: 0,
    },
    /** The reply the quest is waiting for by text message, if any. */
    textResponse: {
      type: String,
      default: "",
    },
    /** The confirmation sent when the expected reply arrives. */
    textResponseConfirmation: {
      type: String,
      default: "",
    },
    /** The puzzles in the quest, in order. */
    puzzles: [questPuzzleSchema],
  },
  {
    // Saving fails with a VersionError if the quest was saved by someone else
    // since it was loaded, so simultaneous changes (such as two teammates
    // solving the same puzzle) can't overwrite each other. The quest service
    // reloads and retries.
    optimisticConcurrency: true,
  }
);

questSchema.virtual("statusDescription").get(function () {
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

/** A quest's puzzle as stored in the database. */
export type QuestPuzzleData = InferSchemaType<typeof questPuzzleSchema>;

/** A quest as stored in the database. */
export type QuestData = InferSchemaType<typeof questSchema>;

export const QuestModel = model("Quest", questSchema);
export const QuestPuzzleModel = model("QuestPuzzle", questPuzzleSchema);
