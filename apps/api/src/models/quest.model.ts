import { type InferSchemaType, Schema, model } from "mongoose";
import { organizationField } from "./organization.model.js";
import { QuestPuzzleStatus, QuestStatus } from "../domain/quest/state.js";

// The status values are part of the rules of the game, so they live in the
// domain; they are re-exported here for code that already imports them.
export { QuestPuzzleStatus, QuestStatus };

/** Who can follow a quest: anyone, or only those it's for and those given a link. */
export const QuestVisibility = ["public", "private"] as const;
export type QuestVisibility = (typeof QuestVisibility)[number];

/** What a quest can be assigned to. */
export const AssigneeKind = ["user", "team"] as const;
export type AssigneeKind = (typeof AssigneeKind)[number];

/** A stop in a quest: its puzzle, and what's printed and scanned there. */
const questPuzzleSchema = new Schema({
  /** The ID of the puzzle. */
  puzzleId: {
    type: Schema.Types.ObjectId,
    ref: "Puzzle",
    required: true,
  },
  /** The code that activates this puzzle in this quest, for every entry. */
  activationCode: {
    type: String,
    default: "",
    required: true,
  },
  /**
   * A word or phrase printed large on the stop's QR card, for a mini-game in
   * which the players put the cards' words together. Optional.
   */
  cardWord: {
    type: String,
  },
});

/** An entry's progress on one of the quest's puzzles. */
const entryPuzzleSchema = new Schema(
  {
    /** The ID of the puzzle, matching one of the quest's stops. */
    puzzleId: {
      type: Schema.Types.ObjectId,
      ref: "Puzzle",
      required: true,
    },
    /** The index in the puzzle's hints of the next hint to reveal. */
    nextHintToDisplay: {
      type: Number,
      required: true,
      default: 0,
    },
    /** The status of the puzzle for this entry (see QuestPuzzleStatus). */
    status: {
      type: Number,
      required: true,
      default: 0,
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
  },
  { _id: false }
);

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

/**
 * A user or team playing a quest, with their progress through it. A quest
 * may have several, racing one another; each plays the same stops.
 */
const entrySchema = new Schema({
  /** The user or team playing. */
  assignee: {
    /** Whether a user or a team. */
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
  /** The status of the entry's quest (see QuestStatus). */
  status: {
    type: Number,
    required: true,
    default: 0,
  },
  /** The reply the entry's quest is waiting for by text message, if any. */
  textResponse: {
    type: String,
    default: "",
  },
  /** The confirmation sent when the expected reply arrives. */
  textResponseConfirmation: {
    type: String,
    default: "",
  },
  /** The entry's progress on each of the quest's puzzles. */
  puzzles: [entryPuzzleSchema],
  /**
   * The times an administrator paused the entry, in order; the last may still
   * be going on. Paused time doesn't count toward the players' time.
   */
  pauses: [pauseSchema],
});

/**
 * A quest: a sequence of puzzles, and the users or teams playing it, each
 * with their own progress.
 */
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
    /** Who can follow the quest. Older quests have none, and are public. */
    visibility: {
      type: String,
      enum: QuestVisibility,
      default: "public",
    },
    /** The puzzles in the quest, in order. */
    puzzles: [questPuzzleSchema],
    /** The users or teams playing the quest, each with their progress. */
    entries: [entrySchema],
  },
  {
    // Saving fails with a VersionError if the quest was saved by someone else
    // since it was loaded, so simultaneous changes (such as two teammates
    // solving the same puzzle, two teams racing, or an edit during play)
    // can't overwrite each other. The quest service reloads and retries.
    optimisticConcurrency: true,
  }
);

// Quest names are unique within an organization.
questSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// Players' quests are found by the IDs of the users and teams playing them.
// IDs are unique across users and teams, so the kind isn't needed.
questSchema.index({ "entries.assignee.id": 1 });

// A puzzle can't be deleted while a quest uses it, found by the puzzle's ID.
questSchema.index({ "puzzles.puzzleId": 1 });

/** A quest's stop as stored in the database. */
export type QuestPuzzleData = InferSchemaType<typeof questPuzzleSchema>;

/** An entry's progress on a puzzle as stored in the database. */
export type EntryPuzzleData = InferSchemaType<typeof entryPuzzleSchema>;

/** An entry as stored in the database. */
export type EntryData = InferSchemaType<typeof entrySchema>;

/** A quest as stored in the database. */
export type QuestData = InferSchemaType<typeof questSchema>;

export const QuestModel = model("Quest", questSchema);
