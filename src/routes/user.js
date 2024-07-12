import express from "express";
import * as UserController from "../controllers/user.controller.js";
import * as UseRenderMode from "../middleware/useRenderMode.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";

const userRouter = express.Router();

userRouter.get(
  "/register",
  TokenAuthenticator.tokenAuthenticate,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.CREATE),
  UserController.renderUser
);

userRouter.get(
  "/:userName",
  TokenAuthenticator.tokenAuthenticate,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.DISPLAY),
  UserController.renderUser
);

userRouter.get(
  "/:userName/edit",
  TokenAuthenticator.tokenAuthenticate,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.EDIT),
  UserController.renderUser
)

export { userRouter as UserRouter }
