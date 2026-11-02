import type { RequestHandler } from "express";
import * as RequestValidationService from "../services/requestValidation.service.js";

/**
 * Creates middleware that rejects the request unless the authenticated user
 * meets the requirement. Use it after tokenAuthenticate, and before any
 * middleware that does work on the user's behalf, such as storing an upload.
 * @param requirement what the user must be
 * @returns the middleware
 */
function authorize(
  requirement: Pick<
    RequestValidationService.ValidationOptions,
    "requiresUser" | "requiresAdmin"
  >
): RequestHandler {
  return (req, res, next) => {
    const validation = RequestValidationService.validateRequest(
      requirement,
      req
    );
    if (validation.status === "error") {
      res
        .status(validation.statusCode)
        .send(JSON.stringify({ status: "error", message: validation.message }));
      return;
    }
    next();
  };
}

/** Rejects requests from anonymous users. */
export const requireUser = authorize({ requiresUser: true });

/** Rejects requests from users who are not administrators. */
export const requireAdmin = authorize({
  requiresUser: true,
  requiresAdmin: true,
});
