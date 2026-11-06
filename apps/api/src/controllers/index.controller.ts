import type { Request, Response } from "express";
import * as SessionAuthenticator from "../middleware/sessionAuthentication.js";
import * as SessionService from "../services/session.service.js";
import * as UserService from "../services/user.service.js";
import { sendWebApp } from "./web.controller.js";

export async function index(req: Request, res: Response): Promise<void> {
  const loggedInUser = UserService.getLoggedInUser(req.user);

  // Administrators' screens aren't in the React app yet. Everyone else's home is
  // there, which shows the landing page to anyone signed out.
  if (loggedInUser?.isAdmin()) {
    res.render("adminHome", { user: loggedInUser });
    return;
  }
  sendWebApp(req, res);
}

/**
 * Signs out: ends the browser's session and returns to the home page.
 * @param req the request
 * @param res the response
 */
export async function logout(req: Request, res: Response): Promise<void> {
  if (req.sessionToken) {
    await SessionService.deleteSession(req.sessionToken);
  }
  SessionAuthenticator.clearSessionCookie(res);
  res.redirect("/");
}
