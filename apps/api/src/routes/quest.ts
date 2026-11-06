import express from "express";
import { requireAdmin, requireUser } from "../middleware/authorization.js";
import { authenticateSession } from "../middleware/sessionAuthentication.js";
import * as UseRenderMode from "../middleware/useRenderMode.js";
import * as QuestController from "../controllers/quest.controller.js";
import { sendWebApp } from "../controllers/web.controller.js";

const questRouter = express.Router();

questRouter.get(
  "/new",
  authenticateSession,
  requireAdmin,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.CREATE),
  QuestController.renderQuest
);

questRouter.get(
  "/:name",
  authenticateSession,
  requireUser,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.DISPLAY),
  QuestController.renderQuest
);

questRouter.get(
  "/:name/edit",
  authenticateSession,
  requireAdmin,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.EDIT),
  QuestController.renderQuest
);

questRouter.get(
  "/:name/puzzle/:puzzleName",
  authenticateSession,
  requireUser,
  sendWebApp
);

questRouter.get(
  "/:name/puzzle/:puzzleName/qrcode",
  authenticateSession,
  requireAdmin,
  QuestController.renderPuzzleActivationQRCode
);

questRouter.get(
  "/:name/pdf",
  authenticateSession,
  requireAdmin,
  QuestController.renderQuestRunBook
);

export { questRouter as QuestRouter };
