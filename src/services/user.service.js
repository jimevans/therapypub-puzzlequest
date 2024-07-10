import {
  TeamModel as Team,
  UserModel as User,
  AuthorizationLevel,
} from "../models/user.model.js";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export async function getUserByUserName(name) {
  const user = await User.findOne({ userName: name });
  if (user === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No user with user name ${name} found`
    };
  }
  return { status: "success", statusCode: 200, data: user };
}

export async function deleteUser(name) {
  const result = await User.findOneAndDelete({ userName: name });
  if (result === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `User with user name ${name} does not exist`
    };
  }
  return { status: "success", statusCode: 200 };
}

export async function createUser(user) {
  const existingUsers = await User.find({ userName: user.userName }).lean();
  const userExists = existingUsers.length !== 0;
  if (userExists) {
    return {
      status: "error",
      statusCode: 400,
      message: `User with user name ${user.userName} already exists`
    };
  }
  let authLevel = user.authorizationLevel || AuthorizationLevel.USER;
  if ((await User.countDocuments()) === 0) {
    // First user created must be an admin user
    authLevel = AuthorizationLevel.ADMIN;
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
    return {
      status: "error",
      statusCode: 500,
      message: `New user not created - ${err}`
    };
  }
  return { status: "success", statusCode: 200 };
}

export async function updateUser(name, userData) {
  const foundUser = await User.findOne({ userName: name });
  if (foundUser === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No user with user name ${name} found`
    };
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
  try {
    await foundUser.save();
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: `User not updated - ${err}`
    };
  }
  return { status: "success" , statusCode: 200};
}

export async function authenticate(userName, password) {
  const user = await User.findOne({ userName: userName }).lean();
  if (user === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No user with user name ${userName} found`
    };
  }
  if (!(await bcrypt.compare(password, user.password))) {
    return {
      status: "error",
      statusCode: 401,
      message: `Password for user ${userName} does not match`
    };
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
  return { status: "success", statusCode: 200, data: token };
}

export async function getUserAndTeams(name) {
  const user = await User.findOne({ userName: name });
  if (user === null) {
    return { error: `No user with user name ${name} found` };
  }
  const allNames = [
    { name: user.userName, displayName: user.displayName, type: "user" },
  ];
  const teamsContainingUser = await Team.find({
    memberNames: { $elemMatch: { $eq: name } },
  });
  teamsContainingUser.forEach((team) =>
    allNames.push({
      name: team.teamName,
      displayName: team.displayName,
      type: "team",
    })
  );
  return { status: "success", statusCode: 200, data: allNames };
}

export async function listUsers() {
  const users = await User.find({});
  return { status: "success", statusCode: 200, data: users };
}
