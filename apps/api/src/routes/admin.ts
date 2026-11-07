import express from "express";
import { sendWebApp } from "../controllers/web.controller.js";
import { requireAdmin } from "../middleware/authorization.js";
import { authenticateSession } from "../middleware/sessionAuthentication.js";

const adminRouter = express.Router();

// The React app's lists. Administrators' other pages are under /quest, /puzzle,
// and /user, with the addresses they have always had.
for (const page of ["/quests", "/puzzles", "/users", "/teams"]) {
  adminRouter.get(page, authenticateSession, requireAdmin, sendWebApp);
}

export { adminRouter as AdminRouter };
