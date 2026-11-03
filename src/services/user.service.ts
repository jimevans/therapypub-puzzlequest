import * as SessionService from "./session.service.js";
import { AuthorizationLevel, UserModel } from "../models/user.model.js";
import type { ServiceResult } from "../types.js";
import * as AuthorizationService from "./authentication.service.js";
import * as TeamService from "./team.service.js";
import { isDuplicateKeyError, unexpectedErrorResult } from "../errors.js";

/**
 * The result of a user service operation; data is a User unless the
 * function's documentation says otherwise.
 */
export type UserResult<T = User> = ServiceResult<T>;

/**
 * The properties a User is created from: a stored user, a request, or the
 * user data in an authentication token, which has no password. `sms` sets
 * allowSmsMessages, matching the stored data and the token.
 */
export interface UserDefinition {
  userName: string;
  displayName: string;
  email: string;
  phone: string;
  sms: boolean;
  authorizationLevel: number;
  password?: string;
  authorizationLevelDescription?: string;
}

/**
 * A data class representing a team a user belongs to.
 */
export class UserTeam {
  /** The unique name of the team. */
  teamName: string;

  /** The display name of the team. */
  displayName: string;

  /**
   * Initializes a new instance of the UserTeam class.
   * @param teamDefinition the team's properties
   */
  constructor(teamDefinition: { teamName: string; displayName: string }) {
    this.teamName = teamDefinition.teamName;
    this.displayName = teamDefinition.displayName;
  }

  /**
   * Gets the object serialized as the JSON representation of this UserTeam.
   * @returns the object to be serialized to JSON
   */
  toJSON(): { teamName: string; displayName: string } {
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
  /** The unique user name of the user. */
  userName: string;

  /** The display name of the user. */
  displayName: string;

  /**
   * The encrypted password of the user. Absent when the user comes from an
   * authentication token.
   */
  password?: string;

  /** The email address of the user. */
  email: string;

  /** The phone number of the user. */
  phone: string;

  /** True if the user allows the system to send them SMS (text) messages. */
  allowSmsMessages: boolean;

  /** The authorization level of the user (see AuthorizationLevel). */
  authorizationLevel: number;

  /** The description of the user's authorization level. */
  authorizationLevelDescription?: string;

  /** The teams the user belongs to, once loaded by getTeams. */
  teams?: UserTeam[];

  /**
   * Initializes a new instance of the User class.
   * @param userDefinition the user's properties
   */
  constructor(userDefinition: UserDefinition) {
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
   * @returns true if the user is an administrative user; otherwise, false
   */
  isAdmin(): boolean {
    return this.authorizationLevel === AuthorizationLevel.ADMIN;
  }

  /**
   * Gets a value indicating whether the current user has the specified user
   * name.
   * @param userName the user name to check
   * @returns true if the user has the specified user name; otherwise, false
   */
  isCurrentUser(userName: string): boolean {
    return userName === this.userName;
  }

  /**
   * Gets the list of teams to which the user belongs.
   * @returns the teams to which the user belongs
   */
  async getTeams(): Promise<UserTeam[]> {
    if (!this.teams) {
      const teamResponse = await TeamService.getTeamsForUser(this.userName);
      if (teamResponse.status === "error") {
        throw new Error(teamResponse.message);
      }
      const teamsContainingUser = teamResponse.data;
      this.teams = teamsContainingUser.map((team) => new UserTeam(team));
    }
    return this.teams;
  }

  /**
   * Gets the user's user name and the names of all the teams the user is a
   * member of.
   * @returns the user's user name followed by their team names
   */
  async getAllUserContexts(): Promise<string[]> {
    const userContexts = [this.userName];
    const teams = await this.getTeams();
    userContexts.push(...teams.map((team) => team.teamName));
    return userContexts;
  }

  /**
   * Gets the object serialized as the JSON representation of this User. The
   * password is never included.
   * @returns the object to be serialized to JSON
   */
  toJSON(): Omit<UserDefinition, "password"> & { teams?: UserTeam[] } {
    return {
      userName: this.userName,
      displayName: this.displayName,
      email: this.email,
      phone: this.phone,
      sms: this.allowSmsMessages,
      authorizationLevel: this.authorizationLevel,
      authorizationLevelDescription: this.authorizationLevelDescription,
      teams: this.teams,
    };
  }
}

/**
 * Gets a user by its user name.
 * @param name the name of the user to get
 * @param includeExtendedAttributes true to return extended attributes of the
 *  user like team membership; otherwise, false
 * @returns a result containing a status, status code, and a User object
 */
export async function getUserByUserName(
  name: string,
  includeExtendedAttributes?: boolean
): Promise<UserResult> {
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
 * @param phoneNumber the phone number of the user to get
 * @returns a result containing the matching users, or an error result
 */
export async function getUsersByPhoneNumber(
  phoneNumber: string
): Promise<UserResult<User[]>> {
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
 * @param name the name of the user to delete
 * @returns a success result, or an error result
 */
export async function deleteUser(name: string): Promise<UserResult<undefined>> {
  const result = await UserModel.findOneAndDelete({ userName: name });
  if (result === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `User with user name ${name} does not exist`,
    };
  }
  await SessionService.deleteUserSessions(name);
  return { status: "success", statusCode: 200 };
}

/**
 * Creates a new user.
 * @param user the definition of the user to create
 * @returns a success result, or an error result
 */
export async function createUser(user: User): Promise<UserResult<undefined>> {
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
  const policyResult = AuthorizationService.validatePasswordPolicy(
    user.password
  );
  if (policyResult.status === "error") {
    return policyResult;
  }
  let authLevel = user.authorizationLevel || AuthorizationLevel.USER;
  if ((await UserModel.countDocuments()) === 0) {
    // First user created must be an admin user
    authLevel = AuthorizationLevel.ADMIN;
  }
  // validatePasswordPolicy has checked that the password is a string.
  const password = await AuthorizationService.encryptPassword(
    user.password as string
  );
  const userData = {
    userName: user.userName.toLowerCase(),
    displayName: user.displayName || user.userName,
    password: password,
    email: user.email.toLowerCase(),
    // In E.164 format, as the request schema converts it.
    phone: user.phone || "",
    sms: user.allowSmsMessages || false,
    authorizationLevel: authLevel,
  };
  try {
    const newUser = new UserModel(userData);
    await newUser.save();
  } catch (err) {
    if (isDuplicateKeyError(err, "userName")) {
      return {
        status: "error",
        statusCode: 400,
        message: "That user name is already in use",
      };
    }
    if (isDuplicateKeyError(err, "email")) {
      return {
        status: "error",
        statusCode: 400,
        message: "That email address is already in use",
      };
    }
    return unexpectedErrorResult("createUser", err);
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Updates a user.
 * @param name the name of the user to update
 * @param userData the data to update the user definition with
 * @returns a success result, or an error result
 */
export async function updateUser(
  name: string,
  userData: Partial<User>
): Promise<UserResult<undefined>> {
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
    const policyResult = AuthorizationService.validatePasswordPolicy(
      userData.password
    );
    if (policyResult.status === "error") {
      return policyResult;
    }
    const password = await AuthorizationService.encryptPassword(
      userData.password
    );
    foundUser.password = password;
    foundUser.passwordChangedAt = new Date(Date.now());
  }
  foundUser.email = userData.email?.toLowerCase() || foundUser.email;
  // In E.164 format, as the request schema converts it; empty removes it.
  if (userData.phone !== undefined) {
    foundUser.phone = userData.phone;
  }
  foundUser.sms =
    userData.allowSmsMessages === undefined ||
    userData.allowSmsMessages === null
      ? foundUser.sms
      : userData.allowSmsMessages;
  foundUser.authorizationLevel =
    userData.authorizationLevel || foundUser.authorizationLevel;
  // A new password, or a change to what the user may do, signs them out
  // everywhere, so no session goes on with the old password or permissions.
  const endSessions =
    foundUser.isModified("password") ||
    foundUser.isModified("authorizationLevel");
  try {
    await foundUser.save();
  } catch (err) {
    if (isDuplicateKeyError(err, "email")) {
      return {
        status: "error",
        statusCode: 400,
        message: "That email address is already in use",
      };
    }
    return unexpectedErrorResult("updateUser", err);
  }
  if (endSessions) {
    await SessionService.deleteUserSessions(name);
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Gets a list of all of the user definitions.
 * @returns a result containing all users
 */
export async function listUsers(): Promise<UserResult<User[]>> {
  const foundUsers = await UserModel.find({});
  const users = foundUsers.map((foundUser) => new User(foundUser));
  return { status: "success", statusCode: 200, data: users };
}

/** The signed-in user, as each request sees them. */
export interface SessionUser {
  userName: string;
  displayName: string;
  email: string;
  /** In E.164 format, or empty. */
  phone: string;
  /** True if the user allows SMS messages. */
  sms: boolean;
  /** The user's authorization level (see AuthorizationLevel). */
  authorizationLevel: number;
}

/**
 * Gets what each request needs to know about a signed-in user. It is read
 * on every request, so changes, such as a new authorization level, apply at
 * once.
 * @param userName the user name
 * @returns the user, or null if there is no such user
 */
export async function getSessionUser(
  userName: string
): Promise<SessionUser | null> {
  const user = await UserModel.findOne({ userName })
    .select("userName displayName email phone sms authorizationLevel")
    .lean();
  return user
    ? {
        userName: user.userName,
        displayName: user.displayName,
        email: user.email,
        phone: user.phone,
        sms: user.sms,
        authorizationLevel: user.authorizationLevel,
      }
    : null;
}

/**
 * Gets the signed-in user from the user data that authenticateSession puts on
 * the request.
 * @param requestUserData the request's user data, or null if anonymous
 * @returns the user, or null if the request is anonymous
 */
export function getLoggedInUser(
  requestUserData: UserDefinition | null | undefined
): User | null {
  if (requestUserData) {
    return new User(requestUserData);
  }

  return null;
}

/**
 * Gets the signed-in user, for request handlers whose request validation has
 * already required one.
 * @param requestUserData the request's user data
 * @returns the user
 * @throws {Error} if the request has no user, which means the handler is
 *  missing its validation
 */
export function requireLoggedInUser(
  requestUserData: UserDefinition | null | undefined
): User {
  const user = getLoggedInUser(requestUserData);
  if (user === null) {
    throw new Error("Request handler requires a signed-in user");
  }
  return user;
}
