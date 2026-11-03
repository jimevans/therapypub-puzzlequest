import { type InferSchemaType, Schema, model } from "mongoose";

/**
 * A signed-in session. Only a hash of the session token is stored, so the
 * collection can't be used to sign in as anyone.
 */
const sessionSchema = new Schema(
  {
    /** The SHA-256 hash of the session token, in hexadecimal. */
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    /** The user the session is for. */
    userName: {
      type: String,
      required: true,
      index: true,
    },
    /** When the session started. */
    createdAt: {
      type: Date,
      required: true,
    },
    /** When the session was last used, to the nearest hour or so. */
    lastUsedAt: {
      type: Date,
      required: true,
    },
    /** When the session ends unless it is used; MongoDB deletes it then. */
    expiresAt: {
      type: Date,
      required: true,
      expires: 0,
    },
    /** The browser or app the session was started from, for reference. */
    userAgent: {
      type: String,
      default: "",
    },
  },
  { versionKey: false }
);

/** A session as stored in the database. */
export type SessionData = InferSchemaType<typeof sessionSchema>;

export const SessionModel = model("Session", sessionSchema);
