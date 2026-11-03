import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

/** Methods that change things, which other sites must not be able to send. */
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Gets the origin of this site: from PQ_BASE_URL when it is set, as it is
 * in production, otherwise from the request.
 * @param req the request
 * @returns the origin, such as "https://example.com"
 */
function siteOrigin(req: Request): string {
  return config.PQ_BASE_URL
    ? new URL(config.PQ_BASE_URL).origin
    : `${req.protocol}://${req.get("host")}`;
}

/**
 * Gets the origin of the page a request came from: its Origin header, or
 * failing that its Referer.
 * @param req the request
 * @returns the origin ("null" for an opaque one), or undefined if the
 *  request doesn't say
 */
function requestingOrigin(req: Request): string | undefined {
  const origin = req.get("origin");
  if (origin !== undefined) {
    return origin;
  }
  const referer = req.get("referer");
  return referer && URL.canParse(referer) ? new URL(referer).origin : undefined;
}

/**
 * Refuses state-changing requests that a browser sent from another site,
 * which is how cross-site request forgery works: another site's page makes
 * the visitor's browser send a request, with the visitor's session cookie.
 * Browsers say which page a request came from (the Origin header, or the
 * Referer), and that must be this site. Requests that don't say aren't from
 * a browser, such as Twilio's webhooks; requests with an Authorization
 * header carry their own credentials rather than the browser's cookie, and
 * other sites can't add one. Together with the session cookie's
 * SameSite=Lax, this follows OWASP's advice without a token in every form.
 * @param req the request
 * @param res the response
 * @param next the next handler
 */
export function requireSameOrigin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!STATE_CHANGING_METHODS.has(req.method) || req.get("authorization")) {
    next();
    return;
  }
  const origin = requestingOrigin(req);
  if (origin === undefined || origin === siteOrigin(req)) {
    next();
    return;
  }
  res.status(403).json({
    status: "error",
    message: "Request refused: it didn't come from this site",
  });
}
