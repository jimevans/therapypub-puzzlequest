import { type InferSchemaType, Schema, model } from "mongoose";

/**
 * Something that happened in a quest. The collection is an append-only log
 * of quest progress: entries are never changed, and resetting a quest adds a
 * QuestReset entry rather than removing earlier ones.
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
    /** Details particular to the type, such as a hint's time penalty. */
    data: {
      type: Schema.Types.Mixed,
    },
  },
  // Entries are never updated, so they need no version key.
  { versionKey: false }
);

// A quest's history is read in order.
questEventSchema.index({ questName: 1, at: 1 });

/** A quest event as stored in the database. */
export type QuestEventData = InferSchemaType<typeof questEventSchema>;

export const QuestEventModel = model("QuestEvent", questEventSchema);
