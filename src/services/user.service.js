import { UserModel as User, AuthorizationLevel } from "../models/user.model.js";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export async function getUserByUserName(name) {
  const user = await User.findOne({ userName: name }).lean();
  if (user === null) {
    return { error: `No user with user name ${name} found` };
  }
  return { status: "success", user: user };
}

export async function deleteUser(name) {
  const result = await User.findOneAndDelete({ userName: name });
  if (result === null) {
    return { error: `User with user name ${name} does not exist` };
  }
  return { status: "success" };
}

export async function createUser(user) {
  const existingUsers = await User.find({ userName: user.userName });
  const userExists = existingUsers.length !== 0;
  if (userExists) {
    return { error: `User with user name ${user.userName} already exists` };
  }
  let authLevel = user.authorizationLevel || AuthorizationLevel.USER.value;
  if ((await User.countDocuments()) === 0) {
    // First user created must be an admin user
    authLevel = AuthorizationLevel.ADMIN.value;
  }
  const password = await bcrypt.hash(user.password, 10);
  try {
    const newUser = new User({
      userName: user.userName,
      displayName: user.displayName || user.userName,
      password: password,
      email: user.email.toLowerCase(),
      sms: user.sms || "",
      authorizationLevel: authLevel,
    });
    await newUser.save();
  } catch (err) {
    return { error: `New user not created - ${err}` };
  }
  return { status: "success" };
}

export async function updateUser(name, userData) {
  const foundUser = await User.findOne({ userName: name });
  if (foundUser === null) {
    return { error: `No user with user name ${name} found` };
  }
  foundUser.displayName = userData.displayName || foundUser.displayName;
  if (userData.password) {
    const password = await bcrypt.hash(userData.password, 10);
    foundUser.password = password;
  }
  foundUser.email = userData.email.toLowerCase() || foundUser.email;
  foundUser.sms = userData.sms || foundUser.sms;
  foundUser.authorizationLevel =
    userData.authorizationLevel || foundUser.authorizationLevel;
  await foundUser.save();
  return { status: "success" };
}

export async function authenticate(userName, password) {
  const user = await User.findOne({ userName: userName }).lean();
  if (user === null) {
    return { error: `No user with user name ${userName} found` };
  }
  if (!(await bcrypt.compare(password, user.password))) {
    return { error: `Password for user ${userName} does not match` };
  }
  const token = jwt.sign(
    {
      userName: user.userName,
      displayName: user.displayName,
      email: user.email,
      sms: user.sms,
      authorizationLevel: user.authorizationLevel,
    },
    config.PQ_SECRET_KEY,
    {
      expiresIn: "2h",
    }
  );
  return { status: "success", token: token };
}

export async function listUsers() {
  const users = await User.find({});
  return { status: "success", users: users };
}
