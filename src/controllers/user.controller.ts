import type { Request, Response } from "express";
import type { RouteRequest } from "../types.js";
import * as AuthenticationService from "../services/authentication.service.js";
import * as PasswordService from "../services/password.service.js";
import * as UserService from "../services/user.service.js";
import * as RequestValidationService from "../services/requestValidation.service.js";
import { RenderMode } from "../middleware/useRenderMode.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import { getErrorMessage } from "../errors.js";

export async function login(req: Request, res: Response): Promise<void> {
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

export async function createUser(req: Request, res: Response): Promise<void> {
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

export async function retrieveUser(
  req: RouteRequest<"userName">,
  res: Response
): Promise<void> {
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
  const loggedInUser = UserService.requireLoggedInUser(req.user);
  if (
    !loggedInUser.isCurrentUser(req.params.userName) &&
    !loggedInUser.isAdmin()
  ) {
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

  res.send(JSON.stringify(userResponse));
}

export async function updateUser(
  req: RouteRequest<"userName">,
  res: Response
): Promise<void> {
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
  const loggedInUser = UserService.requireLoggedInUser(req.user);
  if (
    !loggedInUser.isCurrentUser(req.params.userName) &&
    !loggedInUser.isAdmin()
  ) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to update user ${req.params.userName}`,
      })
    );
    return;
  }
  const updatedUser: Partial<UserService.User> = new UserService.User(req.body);
  if (!loggedInUser.isAdmin()) {
    // Only administrators may change authorization levels. Users change
    // their own passwords through changePassword, which requires the
    // current password.
    updatedUser.authorizationLevel = undefined;
    updatedUser.password = undefined;
  }
  const response = await UserService.updateUser(
    req.params.userName,
    updatedUser
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

export async function deleteUser(
  req: RouteRequest<"userName">,
  res: Response
): Promise<void> {
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

  const loggedInUser = UserService.requireLoggedInUser(req.user);
  if (
    !loggedInUser.isCurrentUser(req.params.userName) &&
    !loggedInUser.isAdmin()
  ) {
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

export async function listUsers(req: Request, res: Response): Promise<void> {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true,
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

export async function changePassword(
  req: RouteRequest<"userName">,
  res: Response
): Promise<void> {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresBody: true,
      requiredBodyProperties: ["currentPassword", "newPassword"],
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
  const loggedInUser = UserService.requireLoggedInUser(req.user);
  if (!loggedInUser.isCurrentUser(req.params.userName)) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to change the password of user ${req.params.userName}`,
      })
    );
    return;
  }
  const response = await PasswordService.changePassword(
    req.params.userName,
    req.body.currentPassword,
    req.body.newPassword
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
  // Changing the password revokes the token used for this request, so
  // replace it to keep the user signed in on this device.
  if (req.cookies && TokenAuthenticator.TOKEN_COOKIE_NAME in req.cookies) {
    TokenAuthenticator.setTokenCookie(res, response.data);
  }
  res.send(JSON.stringify({ status: "success", data: response.data }));
}

export async function forgotPassword(
  req: Request,
  res: Response
): Promise<void> {
  const validation = RequestValidationService.validateRequest(
    {
      requiresBody: true,
      requiredBodyProperties: ["identifier"],
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
  // Respond before doing any work, and identically whether or not an account
  // matches, so the response reveals nothing about which accounts exist.
  res.send(JSON.stringify({ status: "success" }));
  try {
    const response = await PasswordService.requestPasswordReset(
      req.body.identifier
    );
    if (response.status === "error") {
      console.error(`Password reset request failed: ${response.message}`);
    }
  } catch (err) {
    // The response has already been sent, so an uncaught rejection here
    // would otherwise crash the process.
    console.error(`Password reset request failed: ${getErrorMessage(err)}`);
  }
}

export async function resetPassword(
  req: Request,
  res: Response
): Promise<void> {
  const validation = RequestValidationService.validateRequest(
    {
      requiresBody: true,
      requiredBodyProperties: ["resetToken", "newPassword"],
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
  const response = await PasswordService.resetPassword(
    req.body.resetToken,
    req.body.newPassword
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
  res.send(JSON.stringify({ status: "success" }));
}

export async function sendPasswordResetLink(
  req: RouteRequest<"userName">,
  res: Response
): Promise<void> {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true,
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
  const response = await PasswordService.requestPasswordResetForUser(
    req.params.userName
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
  res.send(JSON.stringify({ status: "success" }));
}

export function renderForgotPassword(req: Request, res: Response): void {
  res.render("forgotPassword");
}

export function renderResetPassword(req: Request, res: Response): void {
  // Keep the reset token in the URL from leaking to other sites.
  res.set("Referrer-Policy", "no-referrer");
  // Reset tokens are base64url; rejecting anything else also keeps arbitrary
  // query string content out of the page's inline script.
  const token = req.query.token;
  const isWellFormed =
    typeof token === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(token);
  res.render("resetPassword", { resetToken: isWellFormed ? token : "" });
}

export async function renderUser(
  req: RouteRequest<"userName">,
  res: Response
): Promise<void> {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (req.renderMode && req.renderMode === RenderMode.CREATE) {
    if (!loggedInUser || loggedInUser.isAdmin()) {
      res.render("user", {
        renderMode: req.renderMode,
        currentUser: loggedInUser,
        user: null,
      });
    } else {
      res.render("error", {
        errorTitle: "Unauthorized",
        errorDetails: `User ${loggedInUser.userName} not authorized to create new users`,
      });
    }
    return;
  }

  if (!loggedInUser) {
    res.render("login", { requestingUrl: req.url });
    return;
  }

  if (
    !loggedInUser.isCurrentUser(req.params.userName) &&
    !loggedInUser.isAdmin()
  ) {
    res.render("error", {
      errorTitle: "Unauthorized",
      errorDetails: `User ${req.params.userName} not authorized to retrieve user ${req.params.userName}`,
    });
    return;
  }

  const userResponse = await UserService.getUserByUserName(
    req.params.userName,
    true
  );
  if (userResponse.status === "error") {
    res.render("error", {
      errorTitle: "Not found",
      errorDetails: userResponse.message,
    });
    return;
  }

  res.render("user", {
    renderMode: req.renderMode,
    currentUser: loggedInUser,
    user: userResponse.data,
  });
}
