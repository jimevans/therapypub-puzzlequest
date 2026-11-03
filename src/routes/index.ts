import express from "express";
import { authenticateSession } from "../middleware/sessionAuthentication.js";
import * as IndexController from "../controllers/index.controller.js";

const indexRouter = express.Router();
indexRouter.get("/", authenticateSession, IndexController.index);
indexRouter.get("/login", IndexController.login);
indexRouter.get("/logout", authenticateSession, IndexController.logout);

export { indexRouter as IndexRouter };
