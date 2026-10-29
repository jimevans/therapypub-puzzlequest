import express from "express";
import * as UserController from "../controllers/user.controller.js";
import * as RateLimiter from "../middleware/rateLimiter.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";

const userApiRouter = express.Router();
userApiRouter.get(
  "/list",
  TokenAuthenticator.tokenAuthenticate,
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
  UserController.retrieveUser
);
userApiRouter.put(
  "/:userName",
  TokenAuthenticator.tokenAuthenticate,
  UserController.updateUser
);
userApiRouter.delete(
  "/:userName",
  TokenAuthenticator.tokenAuthenticate,
  UserController.deleteUser
);
userApiRouter.put(
  "/:userName/password",
  RateLimiter.passwordRateLimiter,
  TokenAuthenticator.tokenAuthenticate,
  UserController.changePassword
);
userApiRouter.post(
  "/:userName/password/reset-link",
  TokenAuthenticator.tokenAuthenticate,
  UserController.sendPasswordResetLink
);
userApiRouter.post(
  "/create",
  UserController.createUser
);
userApiRouter.post(
  "/login",
  RateLimiter.loginRateLimiter,
  UserController.login
);

export { userApiRouter as UserApiRouter };
