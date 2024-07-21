import * as TeamService from "../services/team.service.js";
import * as UserService from "../services/user.service.js";

function isUserAuthorized(userNameToBeModified, user) {
  return (
    user &&
    (UserService.isCurrentUser(userNameToBeModified, user) ||
      UserService.isUserAdmin(user))
  );
}

export async function createTeam(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to create teams`,
      })
    );
    return;
  }
  if (!UserService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${req.user.userName} not authorized to create teams`,
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

  const response = await TeamService.createTeam(req.body);
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
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to create teams`,
      })
    );
    return;
  }
}

export async function updateTeam(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to update teams`,
      })
    );
    return;
  }
  if (!UserService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${req.user.userName} not authorized to update teams`,
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

  const response = await TeamService.updateTeam(req.params.teamName, req.body);
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
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to create teams`,
      })
    );
    return;
  }
  if (!UserService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${req.user.userName} not authorized to create teams`,
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
  if (req.user === null) {
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
  if (!req.user) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to update user`,
      })
    );
    return;
  }

  if (!isUserAuthorized(req.params.userName, req.user)) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${req.user.userName} not authorized to join team`,
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
    return
  }
  res.send({ status: "success", statusCode: 200 });
}

export async function leaveTeam(req, res) {
  if (!isUserAuthorized(req.params.userName, req.user)) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${req.user.userName} not authorized to retrieve user ${req.params.userName}`,
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
    return
  }
  res.send({ status: "success", statusCode: 200 });
}
