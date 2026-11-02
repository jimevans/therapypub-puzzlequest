import { type InferSchemaType, Schema, model } from "mongoose";

/** A pending password reset request. */
const passwordResetSchema = new Schema(
  {
    /** The user name of the user requesting the reset. */
    userName: {
      type: String,
      required: true,
      index: true,
    },
    /** The SHA-256 hash of the reset token; the token itself is never stored. */
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

/** A password reset request as stored in the database. */
export type PasswordResetData = InferSchemaType<typeof passwordResetSchema>;

export const PasswordResetModel = model("PasswordReset", passwordResetSchema);
