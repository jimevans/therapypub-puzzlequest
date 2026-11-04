import type { Types } from "mongoose";
import { TeamModel, UserModel } from "../models/user.model.js";
import type { ServiceResult } from "../types.js";
import { type Page, type PageQuery, findPage } from "../api/paging.js";
import { isDuplicateKeyError, unexpectedErrorResult } from "../errors.js";

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
 * Gets a list of all of the team definitions.
 * @returns a response object containing a status, status code, and data
 */
export async function listTeams(): Promise<TeamResult<Team[]>> {
  const foundTeams = await TeamModel.find({});
  const teams = foundTeams.map((team) => new Team(team));
  return { status: "success", statusCode: 200, data: teams };
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
  return { status: "success", statusCode: 200 };
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
  return { status: "success", statusCode: 200 };
}
