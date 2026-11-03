import type { Request, RequestHandler, Response } from "express";
import * as UserService from "../services/user.service.js";

/**
 * Decides whether a signed-in user may make a request.
 * @param user the signed-in user
 * @param req the request
 * @returns true if the user may make it
 */
type Permission = (user: UserService.User, req: Request) => boolean;

/**
 * Determines whether a request is for the API, which answers in JSON, rather
 * than for a page.
 * @param req the request
 * @returns true for an API request
 */
function isApiRequest(req: Request): boolean {
  return req.originalUrl.startsWith("/api/");
}

/**
 * Asks an anonymous visitor to sign in: a 401 for the API, or the sign-in
 * page, which returns to the requested page afterwards.
 * @param req the request
 * @param res the response
 */
function requestSignIn(req: Request, res: Response): void {
  if (isApiRequest(req)) {
    res.status(401).json({
      status: "error",
      message: "User must be logged in to perform operation",
    });
    return;
  }
  res.render("login", { requestingUrl: req.originalUrl });
}

/**
 * Refuses a request the signed-in user may not make, with a 403.
 * @param req the request
 * @param res the response
 * @param user the signed-in user
 */
function refuse(req: Request, res: Response, user: UserService.User): void {
  if (isApiRequest(req)) {
    res.status(403).json({
      status: "error",
      message: `User ${user.userName} not authorized to perform operation`,
    });
    return;
  }
  res.status(403).render("error", {
    errorTitle: "Forbidden",
    errorDetails: `User ${user.userName} is not authorized to view this page`,
  });
}

/**
 * Creates middleware that lets a request through only if the user is signed
 * in and has permission. Use it after tokenAuthenticate, and before anything
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
