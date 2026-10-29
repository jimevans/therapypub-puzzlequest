import { Schema, model } from "mongoose";

/**
 * @typedef {object} PasswordReset A pending password reset request.
 * @property {string} userName the user name of the user requesting the reset
 * @property {string} tokenHash the SHA-256 hash of the reset token; the token itself is never stored
 * @property {Date} expiresAt the date and time after which the token is no longer valid
 */

const passwordResetSchema = new Schema(
  {
    userName: {
      type: String,
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      // MongoDB removes the document automatically once it expires.
      index: { expires: 0 },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const PasswordResetModel = model("PasswordReset", passwordResetSchema);

export { PasswordResetModel };
