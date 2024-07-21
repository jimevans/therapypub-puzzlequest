import {
  UserModel as User,
  AuthorizationLevel,
} from "../models/user.model.js";
import * as AuthorizationService from "./authentication.service.js";
import * as TeamService from "./team.service.js";

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
  const password = await AuthorizationService.encryptPassword(user.password);
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
    const password = await AuthorizationService.encryptPassword(userData.password);
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
 * Gets a list of all of the user definitions.
 * @returns {object} a response object containing a status, status code, and data
 */
export async function listUsers() {
  const users = await User.find({});
  return { status: "success", statusCode: 200, data: users };
}

/**
 * Gets a value indicating wither the user is a user with administrative privileges.
 * @param {User} user and object representing a user
 * @returns {boolean} true if the user is an admin user; otherwise, false
 */
export function isUserAdmin(user) {
  return user && user.authorizationLevel === AuthorizationLevel.ADMIN;
}

/**
 * Gets a value indicating whether a user name is the currently logged in user.
 * @param {string} userName the user name to check
 * @param {User} currentUser the currently logged in user
 * @returns {boolean} true if the user name is the currently logged in user; otherwise, false
 */
export function isCurrentUser(userName, currentUser) {
  return userName === currentUser.userName;
}
