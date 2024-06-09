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

export async function register(req, res) {
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

function isUserAuthorized(userToBeModified, user, authorizationLevel) {
  return (
    AuthenticationService.isCurrentUser(userToBeModified, user) ||
    AuthenticationService.isUserAdmin(authorizationLevel)
  );
}

export async function update(req, res) {
  if (!req.body) {
    res.status(400).send(JSON.stringify({ error: "No request body" }));
    return;
  }
  if (
    !isUserAuthorized(
      req.params.userName,
      req.user,
      req.user.authorizationLevel
    )
  ) {
    res
      .status(403)
      .send(
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

export async function remove(req, res) {
  if (
    !isUserAuthorized(
      req.params.userName,
      req.user,
      req.user.authorizationLevel
    )
  ) {
    res
      .status(403)
      .send(
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

export async function list(req, res) {
  if (!AuthenticationService.isUserAdmin(req.user.authorizationLevel)) {
    res
      .status(403)
      .send(
        JSON.stringify({
          error: `User ${req.user.userName} not authorized to list users`,
        })
      );
  }
  const response = await UserService.listUsers();
  res.send(JSON.stringify(response));
}
