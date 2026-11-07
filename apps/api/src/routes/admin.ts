import express from "express";
import { sendWebApp } from "../controllers/web.controller.js";
import { requireAdmin } from "../middleware/authorization.js";
import { authenticateSession } from "../middleware/sessionAuthentication.js";

const adminRouter = express.Router();

// The React app's administrators' screens, at the addresses they have always
// had. The quest screens are still EJS, under /quest.
const ADMIN_PAGES = [
  "/quests",
  "/puzzles",
  "/users",
  "/teams",
  "/puzzle/new",
  "/puzzle/:name",
  "/puzzle/:name/edit",
];
for (const page of ADMIN_PAGES) {
  adminRouter.get(page, authenticateSession, requireAdmin, sendWebApp);
}

export { adminRouter as AdminRouter };
