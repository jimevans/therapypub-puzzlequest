import { type InferSchemaType, Schema, model } from "mongoose";

/**
 * A short-lived, single-use permission to follow live updates: of a quest, or
 * of the list of quests a user plays. It has one or the other.
 */
const liveTicketSchema = new Schema({
  /** The SHA-256 hash of the ticket; the ticket itself is never stored. */
  tokenHash: {
    type: String,
    required: true,
    unique: true,
  },
  /** The quest the ticket lets its holder follow. */
  questId: {
    type: Schema.Types.ObjectId,
    ref: "Quest",
  },
  /** The user whose quests the ticket lets its holder follow. */
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  /**
   * The signed-in user it was issued to, if any, for a quest: while teams
   * race, what a connection is sent depends on who is watching.
   */
  viewerId: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  /** The share link it came through, if any, so revoking can cut it off. */
  shareLinkId: {
    type: Schema.Types.ObjectId,
    ref: "ShareLink",
  },
  /** When the ticket stops being valid. */
  expiresAt: {
    type: Date,
    required: true,
    // MongoDB removes the document automatically once it expires.
    index: { expires: 0 },
  },
});

/** A live-update ticket as stored in the database. */
export type LiveTicketData = InferSchemaType<typeof liveTicketSchema>;

export const LiveTicketModel = model("LiveTicket", liveTicketSchema);
