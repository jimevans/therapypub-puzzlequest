import { type InferSchemaType, Schema, model } from "mongoose";

/** A pending email address verification. */
const emailVerificationSchema = new Schema(
  {
    /** The user whose address is being verified. */
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /**
     * The address the link was sent to. If the user's address has changed
     * since, the link no longer verifies anything.
     */
    email: {
      type: String,
      required: true,
    },
    /** The SHA-256 hash of the token; the token itself is never stored. */
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    /** When the token stops being valid. */
    expiresAt: {
      type: Date,
      required: true,
      // MongoDB removes the document automatically once it expires.
      index: { expires: 0 },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/** A pending email verification as stored in the database. */
export type EmailVerificationData = InferSchemaType<
  typeof emailVerificationSchema
>;

export const EmailVerificationModel = model(
  "EmailVerification",
  emailVerificationSchema
);
