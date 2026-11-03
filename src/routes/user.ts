import express from "express";
import { requireSelfOrAdmin } from "../middleware/authorization.js";
import * as UserController from "../controllers/user.controller.js";
import * as UseRenderMode from "../middleware/useRenderMode.js";
import { authenticateSession } from "../middleware/sessionAuthentication.js";

const userRouter = express.Router();

userRouter.get(
  "/register",
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.CREATE),
  UserController.renderUser
);

userRouter.get("/password/forgot", UserController.renderForgotPassword);

userRouter.get("/password/reset", UserController.renderResetPassword);

userRouter.get(
  "/:userName",
  authenticateSession,
  requireSelfOrAdmin,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.DISPLAY),
  UserController.renderUser
);

userRouter.get(
  "/:userName/edit",
  authenticateSession,
  requireSelfOrAdmin,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.EDIT),
  UserController.renderUser
);

export { userRouter as UserRouter };
