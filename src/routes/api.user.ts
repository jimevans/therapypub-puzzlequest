import express from "express";
import { validate } from "../middleware/validate.js";
import {
  changePasswordBody,
  createUserBody,
  forgotPasswordBody,
  loginBody,
  resetPasswordBody,
  updateUserBody,
} from "../schemas/user.schemas.js";
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
  validate({ body: forgotPasswordBody }),
  UserController.forgotPassword
);
userApiRouter.post(
  "/password/reset",
  RateLimiter.passwordRateLimiter,
  validate({ body: resetPasswordBody }),
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
  validate({ body: updateUserBody }),
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
  validate({ body: changePasswordBody }),
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
  validate({ body: createUserBody }),
  UserController.createUser
);
userApiRouter.post(
  "/login",
  RateLimiter.loginAddressRateLimiter,
  RateLimiter.loginRateLimiter,
  validate({ body: loginBody }),
  UserController.login
);

export { userApiRouter as UserApiRouter };
