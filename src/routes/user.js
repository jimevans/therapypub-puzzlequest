import express from "express";
import * as UserController from "../controllers/user.controller.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";

const userRouter = express.Router();
userRouter.get(
  "/:userName",
  TokenAuthenticator.tokenAuthenticate,
  UserController.renderUserDetails
);

export { userRouter as UserRouter }
