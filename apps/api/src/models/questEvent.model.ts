import { type InferSchemaType, Schema, model } from "mongoose";
import { AssigneeKind } from "./quest.model.js";

/**
 * Something that happened in a quest. The collection is an append-only log
 * of quest progress: entries are never changed, and resetting a quest adds a
 * QuestReset entry rather than removing earlier ones. The one exception is
 * deleting an account, which takes its user name out of the log, as actor
 * and as entrant.
 */
const questEventSchema = new Schema(
  {
    /** The name of the quest. */
    questName: {
      type: String,
      required: true,
    },
    /** What happened, such as "PuzzleSolved" (see QuestEvent). */
    type: {
      type: String,
      required: true,
    },
    /**
     * The user or team whose entry it happened in, by name as it was then.
     * Events logged before quests had several entries have none.
     */
    entrant: {
      type: new Schema(
        {
          kind: { type: String, enum: AssigneeKind, required: true },
          /** Absent if a user has since deleted their account. */
          name: { type: String },
        },
        { _id: false }
      ),
    },
    /** The puzzle it happened to, for puzzle events. */
    puzzleName: {
      type: String,
    },
    /** When it happened. */
    at: {
      type: Date,
      required: true,
    },
    /** The user name of whoever acted; absent when the system acted. */
    actor: {
      type: String,
    },
    /**
     * True if whoever acted has since deleted their account, which took their
     * user name out of the log.
     */
    actorDeleted: {
      type: Boolean,
    },
    /** Details particular to the type, such as a hint's time penalty. */
    data: {
      type: Schema.Types.Mixed,
    },
  },
  // Entries are never updated, so they need no version key.
  { versionKey: false }
);

// A quest's history is read in order, and a page at a time by ID.
questEventSchema.index({ questName: 1, at: 1 });
questEventSchema.index({ questName: 1, _id: 1 });

/** A quest event as stored in the database. */
export type QuestEventData = InferSchemaType<typeof questEventSchema>;

export const QuestEventModel = model("QuestEvent", questEventSchema);
