import { type InferSchemaType, Schema, model } from "mongoose";

/** The kinds of phone a push target can be. */
export const PUSH_PLATFORMS = ["ios", "android"] as const;

/** Which of Apple's services an iOS app's token belongs to. */
export const PUSH_ENVIRONMENTS = ["production", "development"] as const;

/**
 * Where a session's app gets push notifications: the phone's token with
 * Apple's or Google's service, and the kinds it wants.
 */
const pushTargetSchema = new Schema(
  {
    platform: { type: String, enum: PUSH_PLATFORMS, required: true },
    /** The token Apple's or Google's service gave the app. */
    token: { type: String, required: true },
    /** APNs's production or development (sandbox) service. */
    environment: { type: String, enum: PUSH_ENVIRONMENTS, required: true },
    /** The kinds of notification wanted; unset means every kind. */
    categories: { type: [String], default: undefined },
  },
  { _id: false }
);

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
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
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
    /**
     * Where the session's app gets push notifications, if it asked for
     * them. It ends with the session, so a signed-out phone gets nothing.
     */
    pushTarget: { type: pushTargetSchema, default: undefined },
  },
  { versionKey: false }
);

// A phone's token belongs to one session at a time.
sessionSchema.index(
  { "pushTarget.token": 1 },
  {
    unique: true,
    partialFilterExpression: { "pushTarget.token": { $exists: true } },
  }
);

/** A session as stored in the database. */
export type SessionData = InferSchemaType<typeof sessionSchema>;

export const SessionModel = model("Session", sessionSchema);
