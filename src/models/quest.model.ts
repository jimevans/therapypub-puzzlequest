import { type InferSchemaType, Schema, model } from "mongoose";
import { organizationField } from "./organization.model.js";
import { QuestPuzzleStatus, QuestStatus } from "../domain/quest/state.js";

// The status values are part of the rules of the game, so they live in the
// domain; they are re-exported here for code that already imports them.
export { QuestPuzzleStatus, QuestStatus };

/** What a quest can be assigned to. */
export const AssigneeKind = ["user", "team"] as const;
export type AssigneeKind = (typeof AssigneeKind)[number];

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
  /** True if an administrator skipped the puzzle rather than it being solved. */
  skipped: {
    type: Boolean,
    default: false,
  },
  /**
   * How many of the puzzle's revealed hints carry no penalty, because an
   * administrator refunded them when resetting the puzzle.
   */
  penaltyFreeHints: {
    type: Number,
    default: 0,
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

/** A time when an administrator paused a quest. */
const pauseSchema = new Schema(
  {
    /** When the pause began. */
    startTime: {
      type: Date,
      required: true,
    },
    /** When the quest resumed; absent while the pause goes on. */
    endTime: {
      type: Date,
    },
  },
  { _id: false }
);

/** A quest: a sequence of puzzles assigned to a user or a team. */
const questSchema = new Schema(
  {
    /** The organization the quest belongs to. */
    organizationId: organizationField,
    /** The unique name of the quest. */
    name: {
      type: String,
      default: "",
      required: true,
    },
    /** The display name of the quest. */
    displayName: {
      type: String,
      default: "",
    },
    /** The user or team the quest is assigned to. */
    assignee: {
      /** Whether the quest is assigned to a user or a team. */
      kind: {
        type: String,
        enum: AssigneeKind,
        required: true,
      },
      /** The ID of the user or team. */
      id: {
        type: Schema.Types.ObjectId,
        required: true,
      },
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
    /**
     * The times an administrator paused the quest, in order; the last may
     * still be going on. Paused time doesn't count toward the players' time.
     */
    pauses: [pauseSchema],
  },
  {
    // Saving fails with a VersionError if the quest was saved by someone else
    // since it was loaded, so simultaneous changes (such as two teammates
    // solving the same puzzle) can't overwrite each other. The quest service
    // reloads and retries.
    optimisticConcurrency: true,
  }
);

// Quest names are unique within an organization.
questSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// Players' quests are found by the IDs of the user and teams they are
// assigned to. IDs are unique across users and teams, so the kind isn't
// needed to find them.
questSchema.index({ "assignee.id": 1 });

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
