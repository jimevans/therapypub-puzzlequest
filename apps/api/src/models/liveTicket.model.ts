import { type InferSchemaType, Schema, model } from "mongoose";

/** A short-lived, single-use permission to follow a quest's live updates. */
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
    required: true,
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
