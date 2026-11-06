import express from "express";
import { sendWebApp } from "../controllers/web.controller.js";
import { requireSelfOrAdmin } from "../middleware/authorization.js";
import { authenticateSession } from "../middleware/sessionAuthentication.js";

const userRouter = express.Router();

userRouter.get(
  "/:userName",
  authenticateSession,
  requireSelfOrAdmin,
  sendWebApp
);

userRouter.get(
  "/:userName/edit",
  authenticateSession,
  requireSelfOrAdmin,
  sendWebApp
);

export { userRouter as UserRouter };
