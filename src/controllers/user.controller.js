import * as AuthenticationService from "../services/authentication.service.js";
import * as UserService from "../services/user.service.js";
import { RenderMode } from "../middleware/useRenderMode.js";

export async function login(req, res) {
  if (!req.body) {
    res.status(400).send(JSON.stringify({
      status: "error",
      message: "No request body"
    }));
    return;
  }
  if (!("userName" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({
        status: "error",
        message: "No user name in request body"
      }));
    return;
  }
  if (!("password" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({
        status: "error",
        message: "No password in request body"
      }));
    return;
  }
  const response = await AuthenticationService.authenticate(
    req.body.userName.toLowerCase(),
    req.body.password
  );
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

export async function createUser(req, res) {
  if (!req.body) {
    res.status(400).send(JSON.stringify({
      status: "error",
      message: "No request body"
    }));
    return;
  }
  if (!("userName" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({
        status: "error",
        message: "No user name in request body"
      }));
    return;
  }
  if (!("password" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({
        status: "error",
        message: "No password in request body"
      }));
    return;
  }
  if (!("email" in req.body)) {
    res.status(400).send(JSON.stringify({
      status: "error",
      message: "No email in request body"
    }));
    return;
  }

  const userToCreate = new UserService.User(req.body);
  const response = await UserService.createUser(userToCreate);
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

export async function retrieveUser(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to retrieve user`,
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
  const userResponse = await UserService.getUserByUserName(req.params.userName);
  if (userResponse.status === "error") {
    res.status(userResponse.statusCode).send(
      JSON.stringify({
        status: "error",
        message: userResponse.message,
      })
    );
    return;
  }

  res.send(JSON.stringify(userResponse))
}

export async function updateUser(req, res) {
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

  if (!req.body) {
    res.status(400).send(JSON.stringify({
      status: "error",
      message: "No request body"
    }));
    return;
  }
  if (!loggedInUser.isCurrentUser(req.params.userName) && !loggedInUser.isAdmin) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to update user ${req.params.userName}`,
      })
    );
    return;
  }
  const updatedUser = new UserService.User(req.body);
  const response = await UserService.updateUser(req.params.userName, updatedUser);
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

export async function deleteUser(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to delete user`,
      })
    );
    return;
  }
  if (!loggedInUser.isCurrentUser(req.params.userName) && !loggedInUser.isAdmin) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to delete user ${req.params.userName}`,
      })
    );
    return;
  }
  const response = await UserService.deleteUser(req.params.userName);
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

export async function listUsers(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to list users`,
      })
    );
    return;
  }

  if (!loggedInUser.isAdmin()) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to list users`,
      })
    );
    return;
  }
  const response = await UserService.listUsers();
  res.send(JSON.stringify(response));
}

export async function renderUser(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (req.renderMode && req.renderMode === RenderMode.CREATE) {
    if (!loggedInUser || loggedInUser.isAdmin()) {
      res.render("user", {
        renderMode: req.renderMode,
        currentUser: loggedInUser,
        user: null,
      });
    } else {
      res.render(
        "error",
        {
          errorTitle: "Unauthorized",
          errorDetails: `User ${loggedInUser.userName} not authorized to create new users`,
        }
      );
    }
    return;
  }

  if (!loggedInUser) {
    res.render("login", { requestingUrl: req.url });
    return;
  }

  if (!loggedInUser.isCurrentUser(req.params.userName) && !loggedInUser.isAdmin) {
    res.render(
      "error",
      {
        errorTitle: "Unauthorized",
        errorDetails: `User ${req.params.userName} not authorized to retrieve user ${req.params.userName}`
      }
    );
    return;
  }

  const userResponse = await UserService.getUserByUserName(req.params.userName, true);
  if (userResponse.status === "error") {
    res.render(
      "error",
      {
        errorTitle: "Not found",
        errorDetails: userResponse.message
      }
    );
    return;
  }

  res.render("user", {
    renderMode: req.renderMode,
    currentUser: loggedInUser,
    user: userResponse.data,
  });
}
