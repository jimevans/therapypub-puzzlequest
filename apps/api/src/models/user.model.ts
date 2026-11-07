import { type InferSchemaType, Schema, model } from "mongoose";
import { organizationField } from "./organization.model.js";

/**
 * How much a user is allowed to do. Players play; staff also follow every
 * quest from the stops they run; administrators do everything.
 */
export const AuthorizationLevel = {
  USER: 1,
  STAFF: 5,
  ADMIN: 10,
} as const;
export type AuthorizationLevel =
  (typeof AuthorizationLevel)[keyof typeof AuthorizationLevel];

/** A user of the PuzzleQuest system. */
const userSchema = new Schema({
  /** The organization the user belongs to. */
  organizationId: organizationField,
  /** The unique name of the user. */
  userName: {
    type: String,
    required: true,
  },
  /** The display name of the user. */
  displayName: {
    type: String,
    required: true,
  },
  /** The email address of the user. */
  email: {
    type: String,
    required: true,
  },
  /** The phone number of the user. */
  phone: {
    type: String,
    default: "",
  },
  /** True if the user consents to receive SMS messages. */
  sms: {
    type: Boolean,
    default: false,
  },
  /** The encrypted password of the user. */
  password: {
    type: String,
    required: true,
  },
  /** The authorization level of the user (see AuthorizationLevel). */
  authorizationLevel: {
    type: Number,
    default: AuthorizationLevel.USER,
  },
  /** When the password was last changed, if ever, for the record. */
  passwordChangedAt: {
    type: Date,
  },
  /**
   * When the user proved they receive email at their address, by following
   * a verification link. Unset until then, and again when the address
   * changes. Password reset links go only to verified addresses.
   */
  emailVerifiedAt: {
    type: Date,
  },
});

userSchema.virtual("authorizationLevelDescription").get(function () {
  if (this.authorizationLevel >= AuthorizationLevel.ADMIN) {
    return "Administrator";
  } else if (this.authorizationLevel >= AuthorizationLevel.STAFF) {
    return "Staff";
  }
  return "Player";
});

userSchema.set("toJSON", { virtuals: true });

/** A team to which users can belong. */
const teamSchema = new Schema({
  /** The organization the team belongs to. */
  organizationId: organizationField,
  /** The unique name of the team. */
  teamName: {
    type: String,
    required: true,
  },
  /** The display name of the team. */
  displayName: {
    type: String,
    required: true,
  },
  /** The code a user must give to join the team. */
  joinCode: {
    type: String,
    required: true,
  },
  /** The IDs of the team's members. */
  memberIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
});

// User names and email addresses are unique within an organization.
userSchema.index({ organizationId: 1, userName: 1 }, { unique: true });
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });

// Team names and join codes are unique within an organization.
teamSchema.index({ organizationId: 1, teamName: 1 }, { unique: true });
teamSchema.index({ organizationId: 1, joinCode: 1 }, { unique: true });

// Incoming calls and text messages find their sender by phone number.
userSchema.index({ phone: 1 });

// A player's quests include their teams' quests, found by member.
teamSchema.index({ memberIds: 1 });

/** A user as stored in the database. */
export type UserData = InferSchemaType<typeof userSchema>;

/** A team as stored in the database. */
export type TeamData = InferSchemaType<typeof teamSchema>;

export const UserModel = model("User", userSchema);
export const TeamModel = model("Team", teamSchema);
