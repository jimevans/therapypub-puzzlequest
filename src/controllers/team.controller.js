import * as TeamService from "../services/team.service.js";
import * as UserService from "../services/user.service.js";

export async function createTeam(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to create teams`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to create teams`,
      })
    );
    return;
  }

  if (!req.body) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: "No request body",
      })
    );
    return;
  }

  const teamToCreate = new TeamService.Team(req.body);
  const response = await TeamService.createTeam(teamToCreate);
  if (response.status === "error") {
    res.status(response.statusCode).send(
      JSON.stringify({
        status: "error",
        message: response.message,
      })
    );
    return;
  }
  res.send(JSON.stringify(response));
}

export async function retrieveTeam(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to create teams`,
      })
    );
    return;
  }
  const teamResponse = await TeamService.getTeamByTeamName(req.params.name);
  if (teamResponse.status === "error") {
    res.status(teamResponse.statusCode).send(
      JSON.stringify({
        status: "error",
        message: teamResponse.message
      })
    );
  }
  res.send(JSON.stringify(teamResponse));
}

export async function updateTeam(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to update teams`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to update teams`,
      })
    );
    return;
  }

  if (!req.body) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: "No request body",
      })
    );
    return;
  }

  const team = new TeamService.Team(req.body);
  const response = await TeamService.updateTeam(req.params.teamName, team);
  if (response.status === "error") {
    res.status(response.statusCode).send(
      JSON.stringify({
        status: "error",
        message: response.message,
      })
    );
    return;
  }
  res.send(JSON.stringify(response));
}

export async function deleteTeam(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to create teams`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to create teams`,
      })
    );
    return;
  }
  const response = await TeamService.deleteTeam(req.params.teamName);
  if (response.status === "error") {
    res.status(500).send(
      JSON.stringify({
        status: "error",
        message: response.message,
      })
    );
    return;
  }
  res.send(JSON.stringify(response));
}

export async function listTeams(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to list teams`,
      })
    );
    return;
  }
  const response = await TeamService.listTeams();
  res.send(JSON.stringify(response));
}

export async function joinTeam(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to update user`,
      })
    );
    return;
  }

  if (!loggedInUser.isCurrentUser(req.params.userName) && !loggedInUser.isAdmin) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to join team`,
      })
    );
    return;
  }

  if (!req.body) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: "No request body",
      })
    );
    return;
  }

  if (!req.body.joinCode) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: "No join code in request body",
      })
    );
    return;
  }

  const addUserResponse = await TeamService.addUserToTeam(
    req.params.teamName,
    req.params.userName,
    req.body.joinCode
  );
  if (addUserResponse.status === "error") {
    res.status(addUserResponse.statusCode).send(JSON.stringify(
      {
        status: "error",
        message: addUserResponse.message
      }
    ));
    return;
  }
  res.send({ status: "success", statusCode: 200 });
}

export async function leaveTeam(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to update user`,
      })
    );
    return;
  }

  if (!loggedInUser.isCurrentUser(req.params.userName) && !loggedInUser.isAdmin) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to retrieve user ${req.params.userName}`,
      })
    );
    return;
  }

  const leaveUserResponse = await TeamService.removeUserFromTeam(
    req.params.teamName,
    req.params.userName
  );
  if (leaveUserResponse.status === "error") {
    res.status(leaveUserResponse.statusCode).send(JSON.stringify(
      {
        status: "error",
        message: leaveUserResponse.message
      }
    ));
    return;
  }
  res.send({ status: "success", statusCode: 200 });
}
