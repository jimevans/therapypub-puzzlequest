import {
  UserModel as User,
  AuthorizationLevel,
} from "../models/user.model.js";
import * as TeamService from "./team.service.js";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

/**
 * Gets a user by its user name.
 * @param {string} name the name of the user to get
 * @returns {object} a response object containing a status, status code, and data
 */
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

/**
 * Gets all users having the given phone number.
 * @param {string} phoneNumber the phone number of the user to get
 * @returns {object} a response object containing a status, status code, and data
 */
export async function getUsersByPhoneNumber(phoneNumber) {
  const users = await User.find({ phone: phoneNumber });
  if (!users.length) {
    return {
      status: "error",
      statusCode: 404,
      message: `No user with phone number ${phoneNumber} found`
    };
  }
  return { status: "success", statusCode: 200, data: users };
}

/**
 * Gets a read-only copy of a user, including team membership information.
 * @param {string} name the name of the user to retrieve data for
 * @returns {object} a response object containing a status, status code, and data
 */
export async function getUserInfo(name) {
  const userResponse = await getUserByUserName(name);
  if (userResponse.status === "error") {
    return userResponse;
  }
  const teamNames = [];
  const teamResponse = await TeamService.getTeamNamesForUser(name);
  const teamsContainingUser = teamResponse.data;
  teamsContainingUser.forEach((team) =>
    teamNames.push({
      teamName: team.teamName,
      displayName: team.displayName
    })
  );

  const foundUser = userResponse.data;
  const userInfo = {
    userName: foundUser.userName,
    displayName: foundUser.displayName,
    email: foundUser.email,
    phone: foundUser.phone,
    sms: foundUser.sms,
    authorizationLevel: foundUser.authorizationLevel,
    authorizationLevelDescription: foundUser.authorizationLevelDescription,
    teams: teamNames
  }
  return { status: "success", statusCode: 200, data: userInfo };
}

/**
 * Deletes a user by its user name.
 * @param {string} name the name of the user to delete
 * @returns {object} a response object containing a status, status code, and data
 */
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

/**
 * Creates a new user.
 * @param {object} user the definition of the user to create
 * @returns {object} a response object containing a status, status code, and data
 */
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
  const userData = {
    userName: user.userName.toLowerCase(),
    displayName: user.displayName || user.userName,
    password: password,
    email: user.email.toLowerCase(),
    phone: user.phone || "",
    sms: user.sms || false,
    authorizationLevel: authLevel,
  };
  if (user.phone) {
    const phone = user.phone.replace(/[^\d]/g, "");
    userData.phone = phone.startsWith("1") ? phone.substring(1) : phone;
  }
  try {
    const newUser = new User(userData);
    await newUser.save();
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: `New user not created - ${err.message}`
    };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Updates a user.
 * @param {string} name the name of the user to update
 * @param {object} userData the data to update the user definition with
 * @returns {object} a response object containing a status, status code, and data
 */
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
  if (userData.phone) {
    const phone = userData.phone.replace(/[^\d]/g, "");
    foundUser.phone = phone.startsWith("1") ? phone.substring(1) : phone;
  }
  foundUser.sms = userData.sms || foundUser.sms;
  foundUser.authorizationLevel =
    userData.authorizationLevel || foundUser.authorizationLevel;
  try {
    await foundUser.save();
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: `User not updated - ${err.message}`
    };
  }
  return { status: "success" , statusCode: 200};
}

/**
 * Authenticates a user.
 * @param {string} userName the user name to authenticate
 * @param {string} password the encrypted password to use to authenticate the user
 * @returns {object} a response object containing a status, status code, and data
 */
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
      userName: user.userName.toLowerCase(),
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      sms: user.sms,
      authorizationLevel: user.authorizationLevel,
    },
    config.PQ_SECRET_KEY,
    {
      expiresIn: "12h",
    }
  );
  return { status: "success", statusCode: 200, data: token };
}

/**
 * Gets a list of all of the user definitions.
 * @returns {object} a response object containing a status, status code, and data
 */
export async function listUsers() {
  const users = await User.find({});
  return { status: "success", statusCode: 200, data: users };
}
