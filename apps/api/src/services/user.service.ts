import * as EmailVerificationService from "./emailVerification.service.js";
import * as SessionService from "./session.service.js";
import {
  AuthorizationLevel,
  TeamModel,
  UserModel,
} from "../models/user.model.js";
import { EmailVerificationModel } from "../models/emailVerification.model.js";
import { PasswordResetModel } from "../models/passwordReset.model.js";
import { QuestEventModel } from "../models/questEvent.model.js";
import type { ServiceResult } from "../types.js";
import { type Page, type PageQuery, findPage } from "../api/paging.js";
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
  /** The user's ID; absent for a user not yet stored. */
  id?: string;
  userName: string;
  displayName: string;
  email: string;
  phone: string;
  sms: boolean;
  authorizationLevel: number;
  password?: string;
  authorizationLevelDescription?: string;
  /** When the user verified their email address, if they have. */
  emailVerifiedAt?: Date | null;
}

/**
 * A data class representing a team a user belongs to.
 */
export class UserTeam {
  /** The team's ID. */
  id: string;

  /** The unique name of the team. */
  teamName: string;

  /** The display name of the team. */
  displayName: string;

  /**
   * Initializes a new instance of the UserTeam class.
   * @param teamDefinition the team's properties
   */
  constructor(teamDefinition: {
    id: string;
    teamName: string;
    displayName: string;
  }) {
    this.id = teamDefinition.id;
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
  /** The user's ID; absent for a user not yet stored. */
  id?: string;

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

  /** True if the user has verified their email address. */
  emailVerified: boolean;

  /** The teams the user belongs to, once loaded by getTeams. */
  teams?: UserTeam[];

  /**
   * Initializes a new instance of the User class.
   * @param userDefinition the user's properties
   */
  constructor(userDefinition: UserDefinition) {
    this.id = userDefinition.id;
    this.userName = userDefinition.userName;
    this.displayName = userDefinition.displayName;
    this.password = userDefinition.password;
    this.email = userDefinition.email;
    this.phone = userDefinition.phone;
    this.allowSmsMessages = userDefinition.sms;
    this.authorizationLevel = userDefinition.authorizationLevel;
    this.authorizationLevelDescription =
      userDefinition.authorizationLevelDescription;
    this.emailVerified = Boolean(userDefinition.emailVerifiedAt);
  }

  /**
   * Gets a value indicating whether the user is an administrative user.
   * @returns true if the user is an administrative user; otherwise, false
   */
  isAdmin(): boolean {
    return this.authorizationLevel === AuthorizationLevel.ADMIN;
  }

  /**
   * Gets a value indicating whether the user may follow every quest as staff
   * do. Administrators may.
   * @returns true if so; otherwise, false
   */
  isStaff(): boolean {
    return this.authorizationLevel >= AuthorizationLevel.STAFF;
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
      const teamResponse = await TeamService.getTeamsForUser(this.requireId());
      if (teamResponse.status === "error") {
        throw new Error(teamResponse.message);
      }
      const teamsContainingUser = teamResponse.data;
      this.teams = teamsContainingUser.map(
        (team) =>
          new UserTeam({
            id: team.id ?? "",
            teamName: team.teamName,
            displayName: team.displayName,
          })
      );
    }
    return this.teams;
  }

  /**
   * Gets the IDs a quest the user plays can be assigned to: the user's own,
   * and those of the teams the user is a member of.
   * @returns the user's ID followed by their teams' IDs
   */
  async getAssigneeIds(): Promise<string[]> {
    const teams = await this.getTeams();
    return [this.requireId(), ...teams.map((team) => team.id)];
  }

  /**
   * Gets the user's ID, which every user loaded from the data store has.
   * @returns the ID
   */
  private requireId(): string {
    if (!this.id) {
      throw new Error(`User ${this.userName} has no ID`);
    }
    return this.id;
  }

  /**
   * Gets the object serialized as the JSON representation of this User. The
   * password is never included.
   * @returns the object to be serialized to JSON
   */
  toJSON(): Omit<UserDefinition, "password" | "emailVerifiedAt"> & {
    emailVerified: boolean;
    teams?: UserTeam[];
  } {
    return {
      userName: this.userName,
      displayName: this.displayName,
      email: this.email,
      phone: this.phone,
      sms: this.allowSmsMessages,
      authorizationLevel: this.authorizationLevel,
      authorizationLevelDescription: this.authorizationLevelDescription,
      emailVerified: this.emailVerified,
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
      reason: "not-found",
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
      reason: "not-found",
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
  const user = await UserModel.findOne({ userName: name });
  if (user === null) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `User with user name ${name} does not exist`,
    };
  }
  // Someone must be left to run the site.
  if (
    user.authorizationLevel >= AuthorizationLevel.ADMIN &&
    (await UserModel.countDocuments({
      authorizationLevel: { $gte: AuthorizationLevel.ADMIN },
    })) === 1
  ) {
    return {
      status: "error",
      statusCode: 409,
      reason: "wrong-state",
      message:
        "The only administrator can't be deleted: make someone else an administrator first",
    };
  }
  await UserModel.deleteOne({ _id: user._id });
  await SessionService.deleteUserSessions(user.id);
  await TeamModel.updateMany(
    { memberIds: user._id },
    { $pull: { memberIds: user._id } }
  );
  // Links sent to them, and their name in quests' activity logs, go too, so
  // that nothing left names them. Quests assigned to them stay, for an
  // administrator to reassign or delete.
  await PasswordResetModel.deleteMany({ userId: user._id });
  await EmailVerificationModel.deleteMany({ userId: user._id });
  await QuestEventModel.updateMany(
    { actor: name },
    { $unset: { actor: 1 }, $set: { actorDeleted: true } }
  );
  return { status: "success", statusCode: 200 };
}

/**
 * Deletes a user's own account, once they've given their password again, so
 * that someone using a session left signed in can't.
 * @param name the user's name
 * @param password their password
 * @returns a success result, or an error result
 */
export async function deleteOwnAccount(
  name: string,
  password: string | undefined
): Promise<UserResult<undefined>> {
  const user = await UserModel.findOne({ userName: name });
  if (
    user === null ||
    password === undefined ||
    !(await AuthorizationService.comparePassword(password, user.password))
  ) {
    return {
      status: "error",
      statusCode: 400,
      reason: "incorrect-password",
      message: "That isn't your password",
    };
  }
  return deleteUser(name);
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
      reason: "already-exists",
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
        reason: "already-exists",
        message: "That user name is already in use",
      };
    }
    if (isDuplicateKeyError(err, "email")) {
      return {
        status: "error",
        statusCode: 400,
        reason: "already-exists",
        message: "That email address is already in use",
      };
    }
    return unexpectedErrorResult("createUser", err);
  }
  await EmailVerificationService.trySendVerificationEmail(userData.userName);
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
      reason: "not-found",
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
    userData.authorizationLevel ?? foundUser.authorizationLevel;
  // A new password, or a change to what the user may do, signs them out
  // everywhere, so no session goes on with the old password or permissions.
  const endSessions =
    foundUser.isModified("password") ||
    foundUser.isModified("authorizationLevel");
  // A new address must be verified again.
  const emailChanged = foundUser.isModified("email");
  if (emailChanged) {
    foundUser.emailVerifiedAt = undefined;
  }
  try {
    await foundUser.save();
  } catch (err) {
    if (isDuplicateKeyError(err, "email")) {
      return {
        status: "error",
        statusCode: 400,
        reason: "already-exists",
        message: "That email address is already in use",
      };
    }
    return unexpectedErrorResult("updateUser", err);
  }
  if (endSessions) {
    await SessionService.deleteUserSessions(foundUser.id);
  }
  if (emailChanged) {
    await EmailVerificationService.trySendVerificationEmail(name);
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Gets a page of the users, in the order they signed up.
 * @param query the page wanted
 * @returns the page of users
 */
export async function listUsersPage(query: PageQuery): Promise<Page<User>> {
  const page = await findPage(
    (conditions) => UserModel.find(conditions),
    query
  );
  return { ...page, items: page.items.map((user) => new User(user)) };
}

/** The signed-in user, as each request sees them. */
export interface SessionUser {
  /** The user's ID. */
  id: string;
  userName: string;
  displayName: string;
  email: string;
  /** In E.164 format, or empty. */
  phone: string;
  /** True if the user allows SMS messages. */
  sms: boolean;
  /** The user's authorization level (see AuthorizationLevel). */
  authorizationLevel: number;
  /** True if the user has verified their email address. */
  emailVerified?: boolean;
}

/**
 * Gets what each request needs to know about a signed-in user. It is read
 * on every request, so changes, such as a new authorization level, apply at
 * once.
 * @param userId the user's ID
 * @returns the user, or null if there is no such user
 */
export async function getSessionUser(
  userId: string
): Promise<SessionUser | null> {
  const user = await UserModel.findById(userId)
    .select(
      "userName displayName email phone sms authorizationLevel emailVerifiedAt"
    )
    .lean();
  return user
    ? {
        id: user._id.toString(),
        userName: user.userName,
        displayName: user.displayName,
        email: user.email,
        phone: user.phone,
        sms: user.sms,
        authorizationLevel: user.authorizationLevel,
        emailVerified: Boolean(user.emailVerifiedAt),
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
