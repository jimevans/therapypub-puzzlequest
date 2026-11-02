import { TeamModel } from "../models/user.model.js";
import type { ServiceResult } from "../types.js";
import { getErrorMessage } from "../errors.js";

/**
 * The result of a team service operation; data is a Team unless the
 * function's documentation says otherwise.
 */
export type TeamResult<T = Team> = ServiceResult<T>;

/** The properties a Team is created from: a stored team, or a request. */
export type TeamDefinition = Pick<
  Team,
  "teamName" | "displayName" | "joinCode" | "memberNames"
>;

/**
 * A data class representing a team in the PuzzleQuest application.
 */
export class Team {
  /** The unique name of the team. */
  teamName: string;

  /** The display name of the team. */
  displayName: string;

  /** The code a user must supply to join the team. */
  joinCode: string;

  /** The user names of the team's members. */
  memberNames: string[] = [];

  /**
   * Initializes a new instance of the Team class.
   * @param teamDefinition the team's properties
   */
  constructor(teamDefinition: TeamDefinition) {
    this.teamName = teamDefinition.teamName;
    this.displayName = teamDefinition.displayName;
    this.joinCode = teamDefinition.joinCode;
    this.memberNames = teamDefinition.memberNames;
  }

  /**
   * Gets the object serialized as the JSON representation of this Team.
   * @returns the object to be serialized to JSON
   */
  toJSON(): TeamDefinition {
    return {
      teamName: this.teamName,
      displayName: this.displayName,
      joinCode: this.joinCode,
      memberNames: this.memberNames,
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
      message: `Team with team name ${team.teamName} already exists`,
    };
  }
  try {
    const newTeam = new TeamModel({
      teamName: team.teamName,
      displayName: team.displayName || team.teamName,
      joinCode: team.joinCode,
      memberNames: [],
    });
    await newTeam.save();
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: `New team not created - ${getErrorMessage(err)}`,
    };
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
  teamData: Partial<TeamDefinition>
): Promise<TeamResult<undefined>> {
  const foundTeam = await TeamModel.findOne({ teamName: name });
  if (foundTeam === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No team with team name ${name} found`,
    };
  }
  foundTeam.displayName = teamData.displayName || foundTeam.displayName;
  foundTeam.joinCode = teamData.joinCode || foundTeam.joinCode;
  if (teamData.memberNames) {
    foundTeam.memberNames = teamData.memberNames;
  }
  try {
    await foundTeam.save();
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: `Team not updated - ${getErrorMessage(err)}`,
    };
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
 * Gets a list of all of the teams for a specified user.
 * @param userName the name of the user for which to retrieve teams
 * @returns a response object containing a status, status code, and data
 */
export async function getTeamsForUser(
  userName: string
): Promise<TeamResult<Team[]>> {
  const teamsContainingUser = await TeamModel.find({
    memberNames: { $elemMatch: { $eq: userName } },
  });
  const teamNames = teamsContainingUser.map((team) => new Team(team));
  return { status: "success", statusCode: 200, data: teamNames };
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
  const team = await TeamModel.findOne({ teamName: teamName });
  if (!team) {
    return {
      status: "error",
      statusCode: 404,
      message: `No team with team name ${teamName} found`,
    };
  }

  if (team.memberNames.includes(userName)) {
    return {
      status: "error",
      statusCode: 400,
      message: `User ${userName} is already a member of team ${teamName}`,
    };
  }
  if (team.joinCode.toLowerCase() !== joinCode.toLowerCase()) {
    return {
      status: "error",
      statusCode: 400,
      message: `Invalid join code for team ${teamName}`,
    };
  }
  team.memberNames.push(userName);
  try {
    await team.save();
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: getErrorMessage(err),
    };
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
  const team = await TeamModel.findOne({ teamName: teamName });
  if (!team) {
    return {
      status: "error",
      statusCode: 404,
      message: `No team with team name ${teamName} found`,
    };
  }

  if (!team.memberNames.includes(userName)) {
    return {
      status: "error",
      statusCode: 400,
      message: `User ${userName} is not a member of team ${teamName}`,
    };
  }
  const index = team.memberNames.indexOf(userName);
  team.memberNames.splice(index, 1);
  try {
    await team.save();
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: getErrorMessage(err),
    };
  }
  return { status: "success", statusCode: 200 };
}
