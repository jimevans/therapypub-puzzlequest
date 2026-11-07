import type { Request, Response } from "express";
import * as SessionAuthenticator from "../middleware/sessionAuthentication.js";
import * as SessionService from "../services/session.service.js";

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
