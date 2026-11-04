import express from "express";
import { validate } from "../middleware/validate.js";
import {
  changePasswordBody,
  createUserBody,
  forgotPasswordBody,
  resetPasswordBody,
  updateUserBody,
  verifyEmailBody,
} from "../schemas/user.schemas.js";
import {
  requireAdmin,
  requireSelf,
  requireSelfOrAdmin,
} from "../middleware/authorization.js";
import * as UserController from "../controllers/user.controller.js";
import * as RateLimiter from "../middleware/rateLimiter.js";
import { authenticateSession } from "../middleware/sessionAuthentication.js";

const userApiRouter = express.Router();
userApiRouter.get(
  "/list",
  authenticateSession,
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
userApiRouter.post(
  "/email/verify",
  RateLimiter.emailVerificationRateLimiter,
  validate({ body: verifyEmailBody }),
  UserController.verifyEmail
);
userApiRouter.post(
  "/:userName/email/verification",
  authenticateSession,
  requireSelfOrAdmin,
  RateLimiter.verificationEmailRateLimiter,
  UserController.sendVerificationEmail
);
userApiRouter.get(
  "/:userName",
  authenticateSession,
  requireSelfOrAdmin,
  UserController.retrieveUser
);
userApiRouter.put(
  "/:userName",
  authenticateSession,
  requireSelfOrAdmin,
  validate({ body: updateUserBody }),
  UserController.updateUser
);
userApiRouter.delete(
  "/:userName",
  authenticateSession,
  requireSelfOrAdmin,
  UserController.deleteUser
);
userApiRouter.put(
  "/:userName/password",
  RateLimiter.passwordRateLimiter,
  authenticateSession,
  requireSelf,
  validate({ body: changePasswordBody }),
  UserController.changePassword
);
userApiRouter.post(
  "/:userName/password/reset-link",
  authenticateSession,
  requireAdmin,
  UserController.sendPasswordResetLink
);
userApiRouter.post(
  "/create",
  // Anyone may sign up; the token identifies an administrator creating an
  // account, who may also choose its authorization level.
  authenticateSession,
  validate({ body: createUserBody }),
  UserController.createUser
);

export { userApiRouter as UserApiRouter };
