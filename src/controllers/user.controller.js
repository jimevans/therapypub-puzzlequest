import * as AuthenticationService from "../services/authentication.service.js";
import * as UserService from "../services/user.service.js";

export async function login(req, res) {
  if (!req.body) {
    res.status(400).send(JSON.stringify({ error: "No request body" }));
    return;
  }
  if (!("userName" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({ error: "No user name in request body" }));
    return;
  }
  if (!("password" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({ error: "No password in request body" }));
    return;
  }
  const response = await UserService.authenticate(
    req.body.userName,
    req.body.password
  );
  if ("error" in response) {
    res.status(401).send(JSON.stringify(response));
    return;
  }
  res.send(JSON.stringify(response));
}

function isUserAuthorized(userNameToBeModified, user) {
  return (
    AuthenticationService.isCurrentUser(userNameToBeModified, user) ||
    AuthenticationService.isUserAdmin(user)
  );
}

export async function createUser(req, res) {
  if (!req.body) {
    res.status(400).send(JSON.stringify({ error: "No request body" }));
    return;
  }
  if (!("userName" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({ error: "No user name in request body" }));
    return;
  }
  if (!("password" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({ error: "No password in request body" }));
    return;
  }
  if (!("email" in req.body)) {
    res.status(400).send(JSON.stringify({ error: "No email in request body" }));
    return;
  }
  const response = await UserService.createUser(req.body);
  if ("error" in response) {
    res.status(400).send(JSON.stringify(response));
    return;
  }
  res.send(JSON.stringify(response));
}

export async function retrieveUser(req, res) {
  if (!isUserAuthorized(req.params.userName, req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to retrieve user ${req.params.userName}`,
      })
    );
  }
  const userResponse = await UserService.getUserByUserName(req.params.userName);
  if ("error" in userResponse) {
    res.status(500).send(JSON.stringify(userResponse));
  }

  if (req.renderMode) {
    res.render("user", { renderMode: req.renderMode, user: userResponse.user });
    return;
  }

  res.send(JSON.stringify(userResponse));
}

export async function updateUser(req, res) {
  if (!req.body) {
    res.status(400).send(JSON.stringify({ error: "No request body" }));
    return;
  }
  if (!isUserAuthorized(req.params.userName, req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to update user ${req.params.userName}`,
      })
    );
  }
  const response = await UserService.updateUser(req.params.userName, req.body);
  if ("error" in response) {
    res.status(500).send(JSON.stringify(response));
  }
  res.send(JSON.stringify(response));
}

export async function deleteUser(req, res) {
  if (!isUserAuthorized(req.params.userName, req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to delete user ${req.params.userName}`,
      })
    );
  }
  const response = await UserService.deleteUser(req.params.userName);
  if ("error" in response) {
    res.status(500).send(JSON.stringify(response));
  }
  res.send(JSON.stringify(response));
}

export async function listUsers(req, res) {
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to list users`,
      })
    );
  }
  const response = await UserService.listUsers();
  res.send(JSON.stringify(response));
}

export function renderUserDetails(req, res) {
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to retrieve user ${req.params.userName}`,
      })
    );
  }

  res.render("userDetails", { userName: req.params.userName });
}
