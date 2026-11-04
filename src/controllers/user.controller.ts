import type { Request, Response } from "express";
import type { RouteRequest } from "../types.js";
import * as UserService from "../services/user.service.js";
import { RenderMode } from "../middleware/useRenderMode.js";
import { formatPhoneNumber } from "../schemas/common.js";

// The user pages. Their scripts change accounts through the v1 API.

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

/**
 * Renders the page a verification link opens. The page verifies the
 * address only when the user presses its button, because email scanners
 * often follow links by themselves, which would use up the token.
 * @param req the request
 * @param res the response
 */
export function renderVerifyEmail(req: Request, res: Response): void {
  // Keep the token in the URL from leaking to other sites.
  res.set("Referrer-Policy", "no-referrer");
  // Tokens are base64url; rejecting anything else also keeps arbitrary
  // query string content out of the page's inline script.
  const token = req.query.token;
  const isWellFormed =
    typeof token === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(token);
  res.render("verifyEmail", { verificationToken: isWellFormed ? token : "" });
}
