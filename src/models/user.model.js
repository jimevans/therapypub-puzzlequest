import { Schema, model } from "mongoose";

/**
 * @typedef {object} User A user of the PuzzleQuest system.
 * @property {string} userName the unique name of the user
 * @property {string} displayName the display name of the user
 * @property {string} password the encrypted password of the user
 * @property {string} email the email address of the user
 * @property {string} phone the phone number of the user
 * @property {boolean} sms true if the user consents to receive SMS messages; otherwise false
 * @property {number} authorizationLevel the authorization level of the user
 */

/**
 * @typedef {object} Team A team to which users can belong.
 * @property {string} teamName the unique name of the team
 * @property {string} displayName the display name of the team
 * @property {string} joinCode the code a user must use to join the team
 * @property {string[]} memberNames an array of the user names belonging to the team
 */

const AuthorizationLevel = {
  GUEST: 0,
  USER: 1,
  ADMIN: 10
};

const userSchema = new Schema({
  userName: {
    type: String,
    required: true,
    unique: true,
  },
  displayName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    unique: true,
    required: true,
  },
  phone: {
    type: String,
    default: "",
  },
  sms: {
    type: Boolean,
    default: false
  },
  password: {
    type: String,
    required: true,
  },
  authorizationLevel: {
    type: Number,
    default: 0,
  },
});

userSchema.virtual("authorizationLevelDescription")
  .get(function() {
    if (this.authorizationLevel >= AuthorizationLevel.ADMIN) {
      return "Administrator";
    } else if (this.authorizationLevel >= AuthorizationLevel.USER) {
      return "Authorized user";
    }
    return "Guest";
  });

userSchema.set("toJSON", { virtuals: true });

const teamSchema = new Schema({
  teamName: {
    type: String,
    required: true,
    unique: true,
  },
  displayName: {
    type: String,
    required: true,
  },
  joinCode: {
    type: String,
    required: true,
    unique: true,
  },
  memberNames: [String],
});

const UserModel = model("User", userSchema);
const TeamModel = model("Team", teamSchema);

export { UserModel, TeamModel, AuthorizationLevel };
