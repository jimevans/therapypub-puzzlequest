import { TeamModel as Team } from "../models/user.model.js";

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

export async function listTeams() {
  const teams = await Team.find({});
  return { status: "success", statusCode: 200, data: teams };
}

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
