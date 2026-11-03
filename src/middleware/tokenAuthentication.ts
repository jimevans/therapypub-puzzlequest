import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "../config.js";
import * as AuthenticationService from "../services/authentication.service.js";
import * as UserService from "../services/user.service.js";

export const TOKEN_COOKIE_NAME = "pq-db-token";

/** The user data carried in an authentication token. */
export interface TokenUser {
  userName: string;
  displayName: string;
  email: string;
  phone: string;
  /** True if the user allows SMS messages. */
  sms: boolean;
  /** The user's authorization level (see AuthorizationLevel). */
  authorizationLevel: number;
}

/**
 * Stores an authentication token in the http-only cookie used by UI requests.
 * @param res the response
 * @param token the authentication token
 */
export function setTokenCookie(res: Response, token: string): void {
  res.cookie(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.PQ_RUNTIME_ENVIRONMENT !== "development",
  });
}

/**
 * Identifies the user making a request from their authentication token, and
 * sets req.user: the token's user data, or null for an anonymous request. It
 * doesn't check what the user may do (see authorization.ts). A malformed or
 * invalid token gets a 401 response.
 * @param req the request
 * @param res the response
 * @param next the next handler
 */
export async function tokenAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let token = null;
  req.user = null;
  // The JWT can be in different places, depending on the request type.
  // Methods of transmission not explicitly enumerated in the below code
  // are not supported.
  // Express leaves req.body undefined for requests without a parsed body,
  // including multipart requests, whose body is parsed later by multer.
  if (req.body && "token" in req.body) {
    // Token is part of a form submitted by the user. If the
    // token is found as part of a form submission, move it to
    // an http-only cookie so future UI requests can access it.
    token = req.body.token;
    setTokenCookie(res, token);
  } else if (req.cookies && TOKEN_COOKIE_NAME in req.cookies) {
    // Token is stored as an http-only cookie. This is the usual
    // method used by UI requests.
    token = req.cookies[TOKEN_COOKIE_NAME];
  } else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    // Token is sent in the request authorization header. This
    // is usually the method of transmission from an external API
    // clients.
    token = req.headers.authorization.split(" ")[1];
  }

  if (token !== null) {
    let decoded: JwtPayload & TokenUser;
    try {
      decoded = (await jwt.verify(token, config.PQ_SECRET_KEY)) as JwtPayload &
        TokenUser;
    } catch (err) {
      if (err instanceof Error && err.name === "TokenExpiredError") {
        next();
        return;
      }
      // A token this application didn't sign, or one signed with an earlier
      // secret key. Clearing the cookie lets the browser sign in again.
      res.clearCookie(TOKEN_COOKIE_NAME);
      res
        .status(401)
        .json({ status: "error", message: "Invalid authentication token" });
      return;
    }

    // Tokens for deleted users, or issued before the user's password was
    // last changed, are treated like expired tokens.
    const validationData = await UserService.getTokenValidationData(
      decoded.userName
    );
    if (
      validationData === null ||
      AuthenticationService.isTokenRevoked(
        // Tokens signed by this application always have an issue time; a
        // token without one counts as issued before any password change.
        decoded.iat ?? 0,
        validationData.passwordChangedAt
      )
    ) {
      res.clearCookie(TOKEN_COOKIE_NAME);
      next();
      return;
    }

    req.user = {
      userName: decoded.userName,
      displayName: decoded.displayName,
      email: decoded.email,
      phone: decoded.phone,
      sms: decoded.sms,
      authorizationLevel: decoded.authorizationLevel,
    };
  }
  next();
}
