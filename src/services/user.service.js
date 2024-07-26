import { UserModel, AuthorizationLevel } from "../models/user.model.js";
import * as AuthorizationService from "./authentication.service.js";
import * as TeamService from "./team.service.js";

/**
 * @typedef {Object} UserResult
 * @property {string} status the status of the operation
 * @property {number} statusCode the numeric status code of the operation
 * @property {string | undefined} message text of a message describing the result, especially in an error condition
 * @property {User | User[] | undefined} data the user returned in the result
 */

/**
 * A data class representing a team a user belongs to.
 */
export class UserTeam {
  /**
   * Gets or sets the team name.
   * @type {string}
   */
  teamName;

  /**
   * Gets or sets the display name of the team.
   * @type {string}
   */
  displayName;

  /**
   * Initializes a new instance of the UserTeam class.
   * @param {object} teamDefinition an object containing the definition of the team properties
   */
  constructor(teamDefinition) {
    this.teamName = teamDefinition.teamName;
    this.displayName = teamDefinition.displayName;
  }

  /**
   * Gets an object that will be serialized to JSON as the serialized representation
   * of this UserTeam.
   * @returns {object} the object to be serialized to JSON
   */
  toJSON() {
    return {
      teamName: this.teamName,
      displayName: this.displayName,
    };
  }
}

/**
 * A data class representing a user of the PuzzleQuest application.
 */
export class User {
  /**
   * Gets or sets unique user name of the user.
   * @type {string}
   */
  userName;

  /**
   * Gets or sets the display name of the user.
   * @type {string}
   */
  displayName;

  /**
   * Gets or sets the encrypted password of the user.
   * @type {string}
   */
  password;

  /**
   * Gets or sets the email address of the user.
   * @type {string}
   */
  email;

  /**
   * Gets or sets the phone number of the user.
   * @type {string}
   */
  phone;

  /**
   * Gets or sets a value indicating whether the user allows
   * the system to send them SMS (text) messages.
   * @type {boolean}
   */
  allowSmsMessages;

  /**
   * Gets or sets the authorization level of the user.
   * @type {number}
   */
  authorizationLevel;

  /**
   * Gets or sets the description of the authorization level of the user.
   * @type {string}
   */
  authorizationLevelDescription;

  /**
   * Gets or sets the list of teams to which the user belongs.
   * @type {UserTeam[]}
   */
  #teams;

  /**
   * Initializes a new instance of the User class.
   * @param {object} userDefinition an object containing the definition of user properties
   */
  constructor(userDefinition) {
    this.userName = userDefinition.userName;
    this.displayName = userDefinition.displayName;
    this.password = userDefinition.password;
    this.email = userDefinition.email;
    this.phone = userDefinition.phone;
    this.allowSmsMessages = userDefinition.sms;
    this.authorizationLevel = userDefinition.authorizationLevel;
    this.authorizationLevelDescription =
      userDefinition.authorizationLevelDescription;
  }

  /**
   * Gets a value indicating whether the user is an administrative user.
   * @returns {boolean} true if the user is an administrative user; otherwise, false
   */
  isAdmin() {
    return this.authorizationLevel === AuthorizationLevel.ADMIN;
  }

  /**
   * Gets a value indicating whether the current user has the specified user name.
   * @param {string} userName the user name to check
   * @returns {boolean} true if the user has the specified user name; otherwise, false
   */
  isCurrentUser(userName) {
    return userName === this.userName;
  }

  /**
   * Gets the list of teams to which the user belongs.
   * @returns {Promise<UserTeam[]>} a promise resolving to the list of teams to which the user belongs.
   */
  async getTeams() {
    if (!this.#teams) {
      const teamResponse = await TeamService.getTeamsForUser(this.userName);
      const teamsContainingUser = teamResponse.data;
      this.#teams = teamsContainingUser.map((team) => new UserTeam(team));
    }
    return this.#teams;
  }

  /**
   * Gets a list containing the user's user name and all team names of which the user is a member
   * @returns {Promise<string[]>} a Promise resolving to an array of the user's user name and all team names of which the user is a member
   */
  async getAllUserContexts() {
    const userContexts = [this.userName];
    const teams = await this.getTeams();
    userContexts.push(...teams.map((team) => team.teamName));
    return userContexts;
  }

  /**
   * Gets an object that will be serialized to JSON as the serialized representation
   * of this User.
   * @returns {object} the object to be serialized to JSON
   */
  toJSON() {
    return {
      userName: this.userName,
      displayName: this.displayName,
      password: this.password,
      email: this.email,
      phone: this.phone,
      sms: this.allowSmsMessages,
      authorizationLevel: this.authorizationLevel,
      authorizationLevelDescription: this.authorizationLevelDescription,
      teams: this.#teams,
    };
  }
}

/**
 * Gets a user by its user name.
 * @param {string} name the name of the user to get
 * @param {boolean} includeExtendedAttributes true to return extended attributes of the user like team membership; otherwise, false
 * @returns {Promise<UserResult>} a Promise resolving to a result object
 * containing a status, status code, and a User object.
 */
export async function getUserByUserName(name, includeExtendedAttributes) {
  const foundUser = await UserModel.findOne({ userName: name });
  if (foundUser === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No user with user name ${name} found`,
    };
  }
  const user = new User(foundUser);
  if (includeExtendedAttributes) {
    // Pre-populate the teams information, if the user indicates
    // they want it. Otherwise, we save a query on the data store
    // by not including it.
    await user.getTeams();
  }
  return { status: "success", statusCode: 200, data: user };
}

/**
 * Gets all users having the given phone number.
 * @param {string} phoneNumber the phone number of the user to get
 * @returns {Promise<UserResult>} a Promise resolving to a result object
 * containing a status, status code, and an array of User objects, or an error result object.
 */
export async function getUsersByPhoneNumber(phoneNumber) {
  const foundUsers = await UserModel.find({ phone: phoneNumber });
  if (!foundUsers.length) {
    return {
      status: "error",
      statusCode: 404,
      message: `No user with phone number ${phoneNumber} found`,
    };
  }
  const users = foundUsers.map((foundUser) => new User(foundUser));
  return { status: "success", statusCode: 200, data: users };
}

/**
 * Deletes a user by its user name.
 * @param {string} name the name of the user to delete
 * @returns {Promise<UserResult>} a Promise resolving to a result object
 * containing a status, status code, and a User object, or an error result object.
 */
export async function deleteUser(name) {
  const result = await UserModel.findOneAndDelete({ userName: name });
  if (result === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `User with user name ${name} does not exist`,
    };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Creates a new user.
 * @param {User} user the definition of the user to create
 * @returns {Promise<UserResult>} a Promise resolving to a result object
 * containing a status, status code, and a User object, or an error result object.
 */
export async function createUser(user) {
  const existingUsers = await UserModel.find({
    userName: user.userName,
  }).lean();
  const userExists = existingUsers.length !== 0;
  if (userExists) {
    return {
      status: "error",
      statusCode: 400,
      message: `User with user name ${user.userName} already exists`,
    };
  }
  let authLevel = user.authorizationLevel || AuthorizationLevel.USER;
  if ((await UserModel.countDocuments()) === 0) {
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
    const newUser = new UserModel(userData);
    await newUser.save();
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: `New user not created - ${err.message}`,
    };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Updates a user.
 * @param {string} name the name of the user to update
 * @param {User} userData the data to update the user definition with
 * @returns {Promise<UserResult>} a Promise resolving to a result object
 * containing a status, status code, and a User object, or an error result object.
 */
export async function updateUser(name, userData) {
  const foundUser = await UserModel.findOne({ userName: name });
  if (foundUser === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No user with user name ${name} found`,
    };
  }
  foundUser.displayName = userData.displayName || foundUser.displayName;
  if (userData.password) {
    const password = await AuthorizationService.encryptPassword(
      userData.password
    );
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
      message: `User not updated - ${err.message}`,
    };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Gets a list of all of the user definitions.
 * @returns {Promise<UserResult>} a Promise resolving to a result object
 * containing a status, status code, and an array of User objects.
 */
export async function listUsers() {
  const foundUsers = await UserModel.find({});
  const users = foundUsers.map((foundUser) => new User(foundUser));
  return { status: "success", statusCode: 200, data: users };
}

export function getLoggedInUser(requestUserData) {
  if (requestUserData) {
    return new User(requestUserData);
  }

  return null;
}
