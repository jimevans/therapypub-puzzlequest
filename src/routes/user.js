import express from "express";
import * as UserController from "../controllers/user.controller.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";

const userRouter = express.Router();

function useRenderMode(renderMode) {
  return (req, res, next) => {
    req.renderMode = renderMode;
    next();
  }
}

userRouter.get(
  "/:userName",
  TokenAuthenticator.tokenAuthenticate,
  useRenderMode("display"),
  UserController.retrieveUser
);

export { userRouter as UserRouter }
