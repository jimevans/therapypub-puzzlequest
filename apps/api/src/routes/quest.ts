import express from "express";
import { requireAdmin, requireUser } from "../middleware/authorization.js";
import { authenticateSession } from "../middleware/sessionAuthentication.js";
import { sendWebApp } from "../controllers/web.controller.js";

const questRouter = express.Router();

// The quest editor, only for administrators. Before /:name, which would
// otherwise match it.
questRouter.get("/new", authenticateSession, requireAdmin, sendWebApp);

// The React app shows players their quest, and administrators its console.
questRouter.get("/:name", authenticateSession, requireUser, sendWebApp);

questRouter.get("/:name/edit", authenticateSession, requireAdmin, sendWebApp);

questRouter.get(
  "/:name/puzzle/:puzzleName",
  authenticateSession,
  requireUser,
  sendWebApp
);

export { questRouter as QuestRouter };
