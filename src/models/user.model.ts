import { type InferSchemaType, Schema, model } from "mongoose";

/** How much a user is allowed to do. */
export const AuthorizationLevel = {
  GUEST: 0,
  USER: 1,
  ADMIN: 10,
} as const;
export type AuthorizationLevel =
  (typeof AuthorizationLevel)[keyof typeof AuthorizationLevel];

/** A user of the PuzzleQuest system. */
const userSchema = new Schema({
  /** The unique name of the user. */
  userName: {
    type: String,
    required: true,
    unique: true,
  },
  /** The display name of the user. */
  displayName: {
    type: String,
    required: true,
  },
  /** The email address of the user. */
  email: {
    type: String,
    unique: true,
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
    default: 0,
  },
  /**
   * When the password was last changed; tokens issued before this are no
   * longer valid.
   */
  passwordChangedAt: {
    type: Date,
  },
});

userSchema.virtual("authorizationLevelDescription").get(function () {
  if (this.authorizationLevel >= AuthorizationLevel.ADMIN) {
    return "Administrator";
  } else if (this.authorizationLevel >= AuthorizationLevel.USER) {
    return "Authorized user";
  }
  return "Guest";
});

userSchema.set("toJSON", { virtuals: true });

/** A team to which users can belong. */
const teamSchema = new Schema({
  /** The unique name of the team. */
  teamName: {
    type: String,
    required: true,
    unique: true,
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
    unique: true,
  },
  /** The user names of the team's members. */
  memberNames: [String],
});

/** A user as stored in the database. */
export type UserData = InferSchemaType<typeof userSchema>;

/** A team as stored in the database. */
export type TeamData = InferSchemaType<typeof teamSchema>;

export const UserModel = model("User", userSchema);
export const TeamModel = model("Team", teamSchema);
