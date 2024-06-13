import express from "express";
import * as UserController from "../controllers/user.controller.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";

const userApiRouter = express.Router();
userApiRouter.get(
  "/list",
  TokenAuthenticator.tokenAuthenticate,
  UserController.listUsers
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
userApiRouter.post(
  "/create",
  TokenAuthenticator.tokenAuthenticate,
  UserController.createUser
);
userApiRouter.post("/login", UserController.login);

export { userApiRouter as UserApiRouter };
