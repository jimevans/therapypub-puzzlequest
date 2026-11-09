import type { Types } from "mongoose";
import { TeamModel, UserModel } from "../models/user.model.js";
import type { ServiceResult } from "../types.js";
import { type Page, type PageQuery, findPage } from "../api/paging.js";
import { isDuplicateKeyError, unexpectedErrorResult } from "../errors.js";
import { notifyUserFollowers } from "./websocket.service.js";

/**
 * The result of a team service operation; data is a Team unless the
 * function's documentation says otherwise.
 */
export type TeamResult<T = Team> = ServiceResult<T>;

/** The properties a Team is created from: a stored team, or a request. */
export interface TeamDefinition {
  /** The team's ID, for a stored team. */
  id?: string;
  teamName: string;
  displayName: string;
  joinCode: string;
  /** The IDs of the team's members. */
  memberIds?: readonly (string | Types.ObjectId)[];
}

/** The JSON representation of a Team. */
export type TeamJSON = Pick<
  Team,
  "teamName" | "displayName" | "joinCode" | "memberIds"
>;

/**
 * A data class representing a team in the PuzzleQuest application.
 */
export class Team {
  /** The team's ID, for a stored team. */
  id?: string;

  /** The unique name of the team. */
  teamName: string;

  /** The display name of the team. */
  displayName: string;

  /** The code a user must supply to join the team. */
  joinCode: string;

  /** The IDs of the team's members. */
  memberIds: string[];

  /**
   * Initializes a new instance of the Team class.
   * @param teamDefinition the team's properties
   */
  constructor(teamDefinition: TeamDefinition) {
    this.id = teamDefinition.id;
    this.teamName = teamDefinition.teamName;
    this.displayName = teamDefinition.displayName;
    this.joinCode = teamDefinition.joinCode;
    this.memberIds = (teamDefinition.memberIds ?? []).map(String);
  }

  /**
   * Gets the object serialized as the JSON representation of this Team.
   * @returns the object to be serialized to JSON
   */
  toJSON(): TeamJSON {
    return {
      teamName: this.teamName,
      displayName: this.displayName,
      joinCode: this.joinCode,
      memberIds: this.memberIds,
    };
  }
}

/**
 * Gets a team by its team name.
 * @param name the name of the team to get
 * @returns a response object containing a status, status code, and data
 */
export async function getTeamByTeamName(name: string): Promise<TeamResult> {
  const team = await TeamModel.findOne({ teamName: name });
  if (team === null) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `No team with team name ${name} found`,
    };
  }
  return { status: "success", statusCode: 200, data: new Team(team) };
}

/**
 * Deletes a team by its team name.
 * @param name the name of the team to delete
 * @returns a response object containing a status, status code, and data
 */
export async function deleteTeam(name: string): Promise<TeamResult<undefined>> {
  const result = await TeamModel.findOneAndDelete({ teamName: name });
  if (result === null) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `Team with team name ${name} does not exist`,
    };
  }
  // The team's quests are no longer theirs.
  notifyUserFollowers(result.memberIds.map(String));
  return { status: "success", statusCode: 200 };
}

/**
 * Creates a new team.
 * @param team the definition of the team to create
 * @returns a response object containing a status, status code, and data
 */
export async function createTeam(
  team: TeamDefinition
): Promise<TeamResult<undefined>> {
  const existingTeams = await TeamModel.find({
    teamName: team.teamName,
  }).lean();
  const teamExists = existingTeams.length !== 0;
  if (teamExists) {
    return {
      status: "error",
      statusCode: 400,
      reason: "already-exists",
      message: `Team with team name ${team.teamName} already exists`,
    };
  }
  if (await isJoinCodeTaken(team.joinCode)) {
    return JOIN_CODE_TAKEN;
  }
  try {
    const newTeam = new TeamModel({
      teamName: team.teamName,
      displayName: team.displayName || team.teamName,
      joinCode: team.joinCode,
      memberIds: [],
    });
    await newTeam.save();
  } catch (err) {
    if (isDuplicateKeyError(err, "teamName")) {
      return {
        status: "error",
        statusCode: 400,
        reason: "already-exists",
        message: "That team name is already in use",
      };
    }
    if (isDuplicateKeyError(err, "joinCode")) {
      return {
        status: "error",
        statusCode: 400,
        reason: "already-exists",
        message: "That join code is already in use",
      };
    }
    return unexpectedErrorResult("createTeam", err);
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Join codes are matched without regard to letter case, as players type them,
 * so they compare in this collation.
 */
const JOIN_CODE_COLLATION = { locale: "en", strength: 2 } as const;

/**
 * Says whether another team already has a join code, ignoring letter case.
 * Codes must differ by more than case, since a player joins by the code alone.
 * The database's unique index catches exact repeats, but not ones that differ
 * only in case.
 * @param joinCode the code
 * @param exceptTeamName a team to leave out, such as the one being changed
 * @returns true if one does
 */
async function isJoinCodeTaken(
  joinCode: string,
  exceptTeamName?: string
): Promise<boolean> {
  const others = await TeamModel.find({
    joinCode: joinCode.trim(),
    ...(exceptTeamName ? { teamName: { $ne: exceptTeamName } } : {}),
  })
    .collation(JOIN_CODE_COLLATION)
    .limit(1)
    .lean();
  return others.length > 0;
}

/** The result when another team has the join code. */
const JOIN_CODE_TAKEN = {
  status: "error",
  statusCode: 400,
  reason: "already-exists",
  message: "That join code is already in use",
} as const;

/**
 * Updates a team.
 * @param name the name of the team to update
 * @param teamData the data to update the team definition with
 * @returns a response object containing a status, status code, and data
 */
export async function updateTeam(
  name: string,
  teamData: Partial<Pick<TeamDefinition, "displayName" | "joinCode">>
): Promise<TeamResult<undefined>> {
  const foundTeam = await TeamModel.findOne({ teamName: name });
  if (foundTeam === null) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `No team with team name ${name} found`,
    };
  }
  if (teamData.joinCode && (await isJoinCodeTaken(teamData.joinCode, name))) {
    return JOIN_CODE_TAKEN;
  }
  foundTeam.displayName = teamData.displayName || foundTeam.displayName;
  foundTeam.joinCode = teamData.joinCode || foundTeam.joinCode;
  try {
    await foundTeam.save();
  } catch (err) {
    if (isDuplicateKeyError(err, "joinCode")) {
      return {
        status: "error",
        statusCode: 400,
        reason: "already-exists",
        message: "That join code is already in use",
      };
    }
    return unexpectedErrorResult("updateTeam", err);
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Gets a page of the teams, in the order they were created.
 * @param query the page wanted
 * @returns the page of teams
 */
export async function listTeamsPage(query: PageQuery): Promise<Page<Team>> {
  const page = await findPage(
    (conditions) => TeamModel.find(conditions),
    query
  );
  return { ...page, items: page.items.map((team) => new Team(team)) };
}

/**
 * Gets the user names and display names of teams' members, with one query.
 * @param teams the teams
 * @returns each member's names, by user ID; a member who no longer exists
 *  is missing
 */
export async function describeMembers(
  teams: Team[]
): Promise<Map<string, { userName: string; displayName: string }>> {
  const ids = [...new Set(teams.flatMap((team) => team.memberIds))];
  const users = ids.length
    ? await UserModel.find(
        { _id: { $in: ids } },
        { userName: 1, displayName: 1 }
      ).lean()
    : [];
  return new Map(
    users.map((user) => [
      user._id.toString(),
      { userName: user.userName, displayName: user.displayName ?? "" },
    ])
  );
}

/**
 * Gets a list of all of the teams for a specified user.
 * @param userId the ID of the user for which to retrieve teams
 * @returns a response object containing a status, status code, and data
 */
export async function getTeamsForUser(
  userId: string
): Promise<TeamResult<Team[]>> {
  const teamsContainingUser = await TeamModel.find({ memberIds: userId });
  const teamNames = teamsContainingUser.map((team) => new Team(team));
  return { status: "success", statusCode: 200, data: teamNames };
}

/**
 * Finds a team, and the ID of a user joining or leaving it.
 * @param teamName the name of the team
 * @param userName the name of the user
 * @returns the team and the user's ID, or an error result if either isn't
 *  found
 */
async function findTeamAndUser(
  teamName: string,
  userName: string
): Promise<
  | {
      team: NonNullable<Awaited<ReturnType<typeof TeamModel.findOne>>>;
      userId: Types.ObjectId;
    }
  | TeamResult<never>
> {
  const team = await TeamModel.findOne({ teamName: teamName });
  if (!team) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `No team with team name ${teamName} found`,
    };
  }
  const user = await UserModel.findOne({ userName }, { _id: 1 }).lean();
  if (!user) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `No user with user name ${userName} found`,
    };
  }
  return { team, userId: user._id };
}

/**
 * Adds a user to a team.
 * @param teamName the name of the team to which to add the user
 * @param userName the user name to add to the team
 * @param joinCode the code the user must supply to successfully join the team
 * @returns a response object containing a status, status code, and data
 */
export async function addUserToTeam(
  teamName: string,
  userName: string,
  joinCode: string
): Promise<TeamResult<undefined>> {
  const found = await findTeamAndUser(teamName, userName);
  if ("status" in found) {
    return found;
  }
  const { team, userId } = found;

  if (team.memberIds.some((memberId) => memberId.equals(userId))) {
    return {
      status: "error",
      statusCode: 400,
      reason: "already-exists",
      message: `User ${userName} is already a member of team ${teamName}`,
    };
  }
  if (team.joinCode.toLowerCase() !== joinCode.toLowerCase()) {
    return {
      status: "error",
      statusCode: 400,
      reason: "wrong-join-code",
      message: `Invalid join code for team ${teamName}`,
    };
  }
  team.memberIds.push(userId);
  try {
    await team.save();
  } catch (err) {
    return unexpectedErrorResult("addUserToTeam", err);
  }
  // The team's quests are now theirs too.
  notifyUserFollowers([userId.toString()]);
  return { status: "success", statusCode: 200 };
}

/**
 * Adds a user to the team whose join code they give, as a player joins: they
 * needn't know the team's name, nor see the other teams.
 * @param userName the user to add
 * @param joinCode the code, in any letter case, with any spaces around it
 * @returns the team joined, or why it couldn't be
 */
export async function joinTeamByCode(
  userName: string,
  joinCode: string
): Promise<TeamResult<{ teamName: string; displayName: string }>> {
  const teams = await TeamModel.find({ joinCode: joinCode.trim() })
    .collation(JOIN_CODE_COLLATION)
    .limit(2)
    .lean();
  if (teams.length !== 1) {
    return {
      status: "error",
      statusCode: 400,
      reason: "wrong-join-code",
      message:
        teams.length === 0
          ? "No team has that join code"
          : "That join code matches more than one team; ask the puzzle master for the right one",
    };
  }
  const [team] = teams;
  const joined = await addUserToTeam(team!.teamName, userName, team!.joinCode);
  if (joined.status === "error") {
    return joined.reason === "already-exists"
      ? { ...joined, message: `You're already on ${team!.displayName}` }
      : joined;
  }
  return {
    status: "success",
    statusCode: 200,
    data: { teamName: team!.teamName, displayName: team!.displayName },
  };
}

/**
 * Removes a user from a team.
 * @param teamName the name of the team from which to remove the user
 * @param userName the user name to remove from the team
 * @returns a response object containing a status, status code, and data
 */
export async function removeUserFromTeam(
  teamName: string,
  userName: string
): Promise<TeamResult<undefined>> {
  const found = await findTeamAndUser(teamName, userName);
  if ("status" in found) {
    return found;
  }
  const { team, userId } = found;

  const index = team.memberIds.findIndex((memberId) => memberId.equals(userId));
  if (index === -1) {
    return {
      status: "error",
      statusCode: 400,
      reason: "not-found",
      message: `User ${userName} is not a member of team ${teamName}`,
    };
  }
  team.memberIds.splice(index, 1);
  try {
    await team.save();
  } catch (err) {
    return unexpectedErrorResult("removeUserFromTeam", err);
  }
  notifyUserFollowers([userId.toString()]);
  return { status: "success", statusCode: 200 };
}
