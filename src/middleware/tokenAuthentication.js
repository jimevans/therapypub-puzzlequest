import jwt from "jsonwebtoken";
import { config } from "../config.js";
import * as AuthenticationService from "../services/authentication.service.js";
import * as UserService from "../services/user.service.js";

export const TOKEN_COOKIE_NAME = "pq-db-token";

/**
 * Stores an authentication token in the http-only cookie used by UI requests.
 * @param {object} res the response
 * @param {string} token the authentication token
 */
export function setTokenCookie(res, token) {
  res.cookie(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.PQ_RUNTIME_ENVIRONMENT !== "development",
  });
}

export async function tokenAuthenticate(req, res, next) {
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
    try {
      const decoded = await jwt.verify(token, config.PQ_SECRET_KEY);

      // Tokens for deleted users, or issued before the user's password was
      // last changed, are treated like expired tokens.
      const validationData = await UserService.getTokenValidationData(
        decoded.userName
      );
      if (
        validationData === null ||
        AuthenticationService.isTokenRevoked(
          decoded.iat,
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
    } catch (err) {
      if (err.name !== "TokenExpiredError") {
        res
          .status(401)
          .send(`{ 'error': 'Invalid token - ${JSON.stringify(err)}' }`);
        return;
      }
    }
  }
  next();
}
