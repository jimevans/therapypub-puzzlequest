import { type InferSchemaType, Schema, model } from "mongoose";

/** A link that lets whoever holds it follow a private quest. */
const shareLinkSchema = new Schema(
  {
    /** The SHA-256 hash of the link's token; the token is never stored. */
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    /** The quest the link is for. */
    questId: {
      type: Schema.Types.ObjectId,
      ref: "Quest",
      required: true,
      index: true,
    },
    /** Who or what the link is for, such as "Lobby screen". */
    label: {
      type: String,
      required: true,
    },
    /** The user who made the link. */
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /** When the link stops working. */
    expiresAt: {
      type: Date,
      required: true,
      // MongoDB removes the document automatically once it expires.
      index: { expires: 0 },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/** A share link as stored in the database. */
export type ShareLinkData = InferSchemaType<typeof shareLinkSchema>;

export const ShareLinkModel = model("ShareLink", shareLinkSchema);
