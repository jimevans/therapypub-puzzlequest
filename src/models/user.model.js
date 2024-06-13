import { Schema, model } from "mongoose";

const AuthorizationLevel = {
  GUEST: { value: 0, description: "Guest" },
  USER: { value: 1, description: "Authorized User" },
  ADMIN: { value: 10, description: "Administrator" }
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
  sms: {
    type: String,
    default: "",
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

const teamSchema = new Schema({
  teamName: {
    type: String,
    required: true,
    unique: true,
  },
  members: [userSchema],
});

const UserModel = model("User", userSchema);
const TeamModel = model("Team", teamSchema);

export { UserModel, TeamModel, AuthorizationLevel };
