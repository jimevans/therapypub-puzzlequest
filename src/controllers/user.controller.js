import * as AuthenticationService from "../services/authentication.service.js";
import * as UserService from "../services/user.service.js";
import * as RequestValidationService from "../services/requestValidation.service.js";
import { RenderMode } from "../middleware/useRenderMode.js";

export async function login(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresBody: true,
      requiredBodyProperties: ["userName", "password"],
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
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
  const validation = RequestValidationService.validateRequest(
    {
      requiresBody: true,
      requiredBodyProperties: ["userName", "password", "email"],
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
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
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser.isCurrentUser(req.params.userName) && !loggedInUser.isAdmin()) {
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
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresBody: true,
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }
  const loggedInUser = UserService.getLoggedInUser(req.user);
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
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }

  const loggedInUser = UserService.getLoggedInUser(req.user);
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
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
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

  if (!loggedInUser.isCurrentUser(req.params.userName) && !loggedInUser.isAdmin()) {
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
