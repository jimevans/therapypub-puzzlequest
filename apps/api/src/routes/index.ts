import express from "express";
import { authenticateSession } from "../middleware/sessionAuthentication.js";
import * as IndexController from "../controllers/index.controller.js";
import { sendWebApp } from "../controllers/web.controller.js";

const indexRouter = express.Router();
indexRouter.get("/", authenticateSession, sendWebApp);
indexRouter.get("/logout", authenticateSession, IndexController.logout);

export { indexRouter as IndexRouter };
