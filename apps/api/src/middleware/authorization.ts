import type { Request, RequestHandler, Response } from "express";
import { sendErrorPage } from "../errorPage.js";
import { log } from "../logger.js";
import * as UserService from "../services/user.service.js";
import { Problems, isV1Request, sendProblem } from "../api/problems.js";

/**
 * Decides whether a signed-in user may make a request.
 * @param user the signed-in user
 * @param req the request
 * @returns true if the user may make it
 */
type Permission = (user: UserService.User, req: Request) => boolean;

/**
 * Asks an anonymous visitor to sign in: a 401 for the API, or a redirect to the
 * sign-in page, which returns to the requested page afterwards.
 * @param req the request
 * @param res the response
 */
function requestSignIn(req: Request, res: Response): void {
  if (isV1Request(req)) {
    sendProblem(
      res,
      Problems.signInRequired,
      "Sign in to do this, with the session cookie or a Bearer token"
    );
    return;
  }
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

/**
 * Refuses a request the signed-in user may not make, with a 403.
 * @param req the request
 * @param res the response
 * @param user the signed-in user
 */
function refuse(req: Request, res: Response, user: UserService.User): void {
  if (isV1Request(req)) {
    sendProblem(
      res,
      Problems.forbidden,
      `User ${user.userName} isn't allowed to do this`
    );
    return;
  }
  // sendProblem logs the API's refusals; this logs the pages'.
  log().warn({ event: "forbidden", userId: user.id }, "refused a request");
  sendErrorPage(
    res,
    403,
    "Forbidden",
    `User ${user.userName} is not authorized to view this page`
  );
}

/**
 * Creates middleware that lets a request through only if the user is signed
 * in and has permission. Use it after authenticateSession, and before anything
 * that reads the body or does work on the user's behalf, such as storing an
 * upload, so a refused request gets a 401 or 403 rather than some other
 * error.
 * @param permission what the signed-in user must be allowed
 * @returns the middleware
 */
function authorize(permission: Permission): RequestHandler {
  return (req, res, next) => {
    const user = UserService.getLoggedInUser(req.user);
    if (!user) {
      requestSignIn(req, res);
      return;
    }
    if (!permission(user, req)) {
      refuse(req, res, user);
      return;
    }
    next();
  };
}

/** Lets any signed-in user through. */
export const requireUser = authorize(() => true);

/** Lets only administrators through. */
export const requireAdmin = authorize((user) => user.isAdmin());

/** Lets staff and administrators through. */
export const requireStaff = authorize((user) => user.isStaff());

/**
 * Lets through only the user named by the route's userName parameter: for
 * actions on one's own account that even an administrator may not take for
 * someone else, such as changing a password, which needs the current one.
 */
export const requireSelf = authorize((user, req) =>
  user.isCurrentUser(String(req.params.userName))
);

/**
 * Lets through the user named by the route's userName parameter, and
 * administrators.
 */
export const requireSelfOrAdmin = authorize(
  (user, req) =>
    user.isCurrentUser(String(req.params.userName)) || user.isAdmin()
);
