import type { Request, Response } from "express";
import type { BodyRequest, RouteRequest } from "../types.js";
import type {
  ChangePasswordBody,
  CreateUserBody,
  ForgotPasswordBody,
  LoginBody,
  ResetPasswordBody,
  UpdateUserBody,
} from "../schemas/user.schemas.js";
import * as AuthenticationService from "../services/authentication.service.js";
import * as PasswordService from "../services/password.service.js";
import * as UserService from "../services/user.service.js";
import { RenderMode } from "../middleware/useRenderMode.js";
import { AuthorizationLevel } from "../models/user.model.js";
import { formatPhoneNumber } from "../schemas/common.js";
import * as SessionAuthenticator from "../middleware/sessionAuthentication.js";
import * as SessionService from "../services/session.service.js";
import { getErrorMessage } from "../errors.js";

export async function login(
  req: BodyRequest<LoginBody>,
  res: Response
): Promise<void> {
  const response = await AuthenticationService.authenticate(
    req.body.userName,
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
  const token = await SessionService.createSession(
    response.data.userName,
    req.get("user-agent")
  );
  if (req.body.client === "native") {
    // An app keeps the token itself and sends it as a Bearer token.
    res.json({ status: "success", data: { token } });
    return;
  }
  SessionAuthenticator.setSessionCookie(res, token);
  res.json({ status: "success" });
}

/**
 * Signs out: ends the session the request presents, from its cookie or
 * Bearer token. Signing out when not signed in does nothing.
 * @param req the request
 * @param res the response
 */
export async function logout(req: Request, res: Response): Promise<void> {
  if (req.sessionToken) {
    await SessionService.deleteSession(req.sessionToken);
  }
  SessionAuthenticator.clearSessionCookie(res);
  res.json({ status: "success" });
}

export async function createUser(
  req: BodyRequest<CreateUserBody>,
  res: Response
): Promise<void> {
  const { authorizationLevel, ...userDefinition } = req.body;
  // Only an administrator may choose the new account's authorization level;
  // anyone else signing up gets an ordinary account.
  const isAdmin = UserService.getLoggedInUser(req.user)?.isAdmin() ?? false;
  const userToCreate = new UserService.User({
    ...userDefinition,
    authorizationLevel:
      isAdmin && authorizationLevel !== undefined
        ? authorizationLevel
        : AuthorizationLevel.USER,
  });
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
  req: RouteRequest<"userName", UpdateUserBody>,
  res: Response
): Promise<void> {
  const loggedInUser = UserService.requireLoggedInUser(req.user);
  const { sms, ...changes } = req.body;
  const updatedUser: Partial<UserService.User> = {
    ...changes,
    allowSmsMessages: sms,
  };
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
  const response = await UserService.listUsers();
  res.send(JSON.stringify(response));
}

export async function changePassword(
  req: RouteRequest<"userName", ChangePasswordBody>,
  res: Response
): Promise<void> {
  // The user stays signed in on this device; their other sessions end.
  const response = await PasswordService.changePassword(
    req.params.userName,
    req.body.currentPassword,
    req.body.newPassword,
    req.sessionToken
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

export async function forgotPassword(
  req: BodyRequest<ForgotPasswordBody>,
  res: Response
): Promise<void> {
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
  req: BodyRequest<ResetPasswordBody>,
  res: Response
): Promise<void> {
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
        phone: "",
      });
    } else {
      res.render("error", {
        errorTitle: "Unauthorized",
        errorDetails: `User ${loggedInUser.userName} not authorized to create new users`,
      });
    }
    return;
  }

  // The route lets through only the user and administrators.
  const currentUser = UserService.requireLoggedInUser(req.user);
  const userResponse = await UserService.getUserByUserName(
    req.params.userName,
    true
  );
  if (userResponse.status === "error") {
    res.status(userResponse.statusCode).render("error", {
      errorTitle: "Not found",
      errorDetails: userResponse.message,
    });
    return;
  }

  res.render("user", {
    renderMode: req.renderMode,
    currentUser: currentUser,
    user: userResponse.data,
    phone: formatPhoneNumber(userResponse.data.phone),
  });
}
