import express from "express";
import * as UserController from "../controllers/user.controller.js";
import * as UseRenderMode from "../middleware/useRenderMode.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";

const userRouter = express.Router();

userRouter.get(
  "/register",
  TokenAuthenticator.tokenAuthenticate,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.CREATE),
  UserController.retrieveUser
);

userRouter.get(
  "/:userName",
  TokenAuthenticator.tokenAuthenticate,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.DISPLAY),
  UserController.retrieveUser
);

userRouter.get(
  "/:userName/edit",
  TokenAuthenticator.tokenAuthenticate,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.EDIT),
  UserController.retrieveUser
)

export { userRouter as UserRouter }
