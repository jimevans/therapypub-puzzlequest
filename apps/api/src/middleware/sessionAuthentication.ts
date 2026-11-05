import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import * as SessionService from "../services/session.service.js";
import * as UserService from "../services/user.service.js";

/** The cookie holding a browser's session token. */
export const SESSION_COOKIE_NAME = "pq-session";

/**
 * The cookie that held a signed token before sessions were stored in the
 * database. It is cleared when seen.
 */
const LEGACY_TOKEN_COOKIE_NAME = "pq-db-token";

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.PQ_RUNTIME_ENVIRONMENT !== "development",
  sameSite: "lax",
  path: "/",
} as const;

/**
 * Stores a session token in the browser's cookie. Page scripts can't read
 * it, and other sites can't make the browser send it with their form posts.
 * @param res the response
 * @param token the session token
 */
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: SessionService.SESSION_LIFETIME_MS,
  });
}

/**
 * Removes the browser's session cookie.
 * @param res the response
 */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS);
}

/**
 * Gets the session token a request presents: from an Authorization: Bearer
 * header, as an app sends it, or from the cookie, as a browser does.
 * @param req the request
 * @returns the token, or undefined if there is none
 */
function getSessionToken(req: Request): string | undefined {
  const header = req.get("authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim() || undefined;
  }
  return req.cookies?.[SESSION_COOKIE_NAME] || undefined;
}

/**
 * Identifies the user making a request from their session, and sets
 * req.user (null for an anonymous request) and req.sessionToken. A token for
 * a session that has ended, or for a deleted user, counts as anonymous, and
 * its cookie is removed. It doesn't check what the user may do (see
 * authorization.ts).
 * @param req the request
 * @param res the response
 * @param next the next handler
 */
export async function authenticateSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  req.user = null;
  req.sessionToken = undefined;
  if (req.cookies?.[LEGACY_TOKEN_COOKIE_NAME]) {
    res.clearCookie(LEGACY_TOKEN_COOKIE_NAME);
  }
  const token = getSessionToken(req);
  if (!token) {
    next();
    return;
  }
  const fromCookie = token === req.cookies?.[SESSION_COOKIE_NAME];
  const session = await SessionService.findSession(token);
  const user = session && (await UserService.getSessionUser(session.userId));
  if (!session || !user) {
    if (fromCookie) {
      clearSessionCookie(res);
    }
    next();
    return;
  }
  if (session.renewed && fromCookie) {
    // The session's lifetime was extended; extend the cookie's to match.
    setSessionCookie(res, token);
  }
  req.user = user;
  req.sessionToken = token;
  next();
}
