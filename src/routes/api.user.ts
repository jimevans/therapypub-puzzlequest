import express from "express";
import {
  requireAdmin,
  requireSelf,
  requireSelfOrAdmin,
} from "../middleware/authorization.js";
import * as UserController from "../controllers/user.controller.js";
import * as RateLimiter from "../middleware/rateLimiter.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";

const userApiRouter = express.Router();
userApiRouter.get(
  "/list",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  UserController.listUsers
);
userApiRouter.post(
  "/password/forgot",
  RateLimiter.passwordRateLimiter,
  UserController.forgotPassword
);
userApiRouter.post(
  "/password/reset",
  RateLimiter.passwordRateLimiter,
  UserController.resetPassword
);
userApiRouter.get(
  "/:userName",
  TokenAuthenticator.tokenAuthenticate,
  requireSelfOrAdmin,
  UserController.retrieveUser
);
userApiRouter.put(
  "/:userName",
  TokenAuthenticator.tokenAuthenticate,
  requireSelfOrAdmin,
  UserController.updateUser
);
userApiRouter.delete(
  "/:userName",
  TokenAuthenticator.tokenAuthenticate,
  requireSelfOrAdmin,
  UserController.deleteUser
);
userApiRouter.put(
  "/:userName/password",
  RateLimiter.passwordRateLimiter,
  TokenAuthenticator.tokenAuthenticate,
  requireSelf,
  UserController.changePassword
);
userApiRouter.post(
  "/:userName/password/reset-link",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  UserController.sendPasswordResetLink
);
userApiRouter.post(
  "/create",
  // Anyone may sign up; the token identifies an administrator creating an
  // account, who may also choose its authorization level.
  TokenAuthenticator.tokenAuthenticate,
  UserController.createUser
);
userApiRouter.post(
  "/login",
  RateLimiter.loginAddressRateLimiter,
  RateLimiter.loginRateLimiter,
  UserController.login
);

export { userApiRouter as UserApiRouter };
