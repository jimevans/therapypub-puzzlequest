import { TeamModel as Team } from "../models/user.model.js";

/**
 * Gets a team by its team name.
 * @param {string} name the name of the team to get
 * @returns {object} a response object containing a status, status code, and data
 */
export async function getTeamByTeamName(name) {
  const team = await Team.findOne({ teamName: name });
  if (team === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No team with team name ${name} found`
    };
  }
  return { status: "success", statusCode: 200, data: team };
}

/**
 * Deletes a team by its team name.
 * @param {string} name the name of the team to delete
 * @returns {object} a response object containing a status, status code, and data
 */
export async function deleteTeam(name) {
  const result = await Team.findOneAndDelete({ teamName: name });
  if (result === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `Team with team name ${name} does not exist`
    };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Creates a new team.
 * @param {object} team the definition of the team to create
 * @returns {object} a response object containing a status, status code, and data
 */
export async function createTeam(team) {
  const existingTeams = await Team.find({ teamName: team.teamName }).lean();
  const teamExists = existingTeams.length !== 0;
  if (teamExists) {
    return {
      status: "error",
      statusCode: 400,
      message: `Team with team name ${team.teamName} already exists`
    };
  }
  try {
    const newTeam = new Team({
      teamName: team.teamName,
      displayName: team.displayName || team.teamName,
      joinCode: team.joinCode,
      memberNames: []
    });
    await newTeam.save();
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: `New team not created - ${err.message}`
    };
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Updates a team.
 * @param {string} name the name of the team to update
 * @param {object} puzzleData the data to update the team definition with
 * @returns {object} a response object containing a status, status code, and data
 */
export async function updateTeam(name, teamData) {
  const foundTeam = await Team.findOne({ teamName: name });
  if (foundTeam === null) {
    return {
      status: "error",
      statusCode: 404,
      message: `No team with team name ${name} found`
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
      message: `Team not updated - ${err.message}`
    };
  }
  return { status: "success" , statusCode: 200};
}

/**
 * Gets a list of all of the team definitions.
 * @returns {object} a response object containing a status, status code, and data
 */
export async function listTeams() {
  const teams = await Team.find({});
  return { status: "success", statusCode: 200, data: teams };
}

/**
 * Gets a list of all of the teams for a specified user.
 * @param {string} userName the name of the user for which to retrieve teams
 * @returns {object} a response object containing a status, status code, and data
 */
export async function getTeamNamesForUser(userName) {
  const teamsContainingUser = await Team.find({
    memberNames: { $elemMatch: { $eq: userName } },
  });
  const teamNames = []
  teamsContainingUser.forEach((team) =>
    teamNames.push({
      teamName: team.teamName,
      displayName: team.displayName,
      type: "team",
    })
  );
  return { status: "success", statusCode: 200, data: teamNames };
}

/**
 * Adds a user to a team.
 * @param {string} teamName the name of the team to which to add the user
 * @param {string} userName the user name to add to the team
 * @param {string} joinCode the code the user must supply to successfully join the team
 * @returns {object} a response object containing a status, status code, and data
 */
export async function addUserToTeam(teamName, userName, joinCode) {
  const getTeamResponse = await getTeamByTeamName(teamName);
  if (getTeamResponse.status === "error") {
    return getTeamResponse;
  }

  const team = getTeamResponse.data;
  if (team.memberNames.includes(userName)) {
    return {
      status: "error",
      statusCode: 400,
      message: `User ${userName} is already a member of team ${teamName}`
    }
  }
  if (team.joinCode.toLowerCase() !== joinCode.toLowerCase()) {
    return {
      status: "error",
      statusCode: 400,
      message: `Invalid join code for team ${teamName}`
    }
  }
  team.memberNames.push(userName);
  try {
    await team.save();
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: err.message
    }
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Removes a user from a team.
 * @param {string} teamName the name of the team from which to remove the user
 * @param {string} userName the user name to remove from the team
 * @returns {object} a response object containing a status, status code, and data
 */
export async function removeUserFromTeam(teamName, userName) {
  const getTeamResponse = await getTeamByTeamName(teamName);
  if (getTeamResponse.status === "error") {
    return getTeamResponse;
  }

  const team = getTeamResponse.data;
  if (!team.memberNames.includes(userName)) {
    return {
      status: "error",
      statusCode: 400,
      message: `User ${userName} is not a member of team ${teamName}`
    }
  }
  const index = team.memberNames.indexOf(userName);
  team.memberNames.splice(index, 1);
  try {
    await team.save();
  } catch (err) {
    return {
      status: "error",
      statusCode: 500,
      message: err.message
    }
  }
  return { status: "success", statusCode: 200 };
}
