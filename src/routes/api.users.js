import express from "express";
import * as UserController from "../controllers/user.controller.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";

const userApiRouter = express.Router();
userApiRouter.get(
  "/list",
  TokenAuthenticator.tokenAuthenticate,
  UserController.list
);
userApiRouter.post("/register", UserController.register);
userApiRouter.post("/login", UserController.login);

export { userApiRouter as UserApiRouter };
