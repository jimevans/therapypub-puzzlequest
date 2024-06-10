import express from "express";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import * as IndexController from "../controllers/index.controller.js";

const indexRouter = express.Router();
indexRouter.get(
  "/",
  TokenAuthenticator.tokenAuthenticate,
  IndexController.index
);
indexRouter.get("/login", IndexController.login);
indexRouter.post(
  "/login",
  TokenAuthenticator.tokenAuthenticate,
  IndexController.authenticate
);
indexRouter.get("/logout", IndexController.logout);

export { indexRouter as IndexRouter };
