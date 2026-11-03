import express from "express";
import { validate } from "../middleware/validate.js";
import {
  activatePuzzleBody,
  createQuestBody,
  requestHintBody,
  solvePuzzleBody,
  updateQuestBody,
} from "../schemas/quest.schemas.js";
import { requireAdmin, requireUser } from "../middleware/authorization.js";
import {
  activationRateLimiter,
  solutionRateLimiter,
} from "../middleware/rateLimiter.js";
import { authenticateSession } from "../middleware/sessionAuthentication.js";
import { uploadActivationImage } from "../middleware/upload.js";
import * as QuestController from "../controllers/quest.controller.js";
import * as QRCodeReader from "../middleware/qrCodeReader.js";

const questApiRouter = express.Router();
questApiRouter.get(
  "/list",
  authenticateSession,
  requireAdmin,
  QuestController.listQuests
);
questApiRouter.get(
  "/:name",
  authenticateSession,
  requireUser,
  QuestController.retrieveQuest
);
questApiRouter.put(
  "/:name",
  authenticateSession,
  requireAdmin,
  validate({ body: updateQuestBody }),
  QuestController.updateQuest
);
questApiRouter.delete(
  "/:name",
  authenticateSession,
  requireAdmin,
  QuestController.deleteQuest
);
questApiRouter.post(
  "/create",
  authenticateSession,
  requireAdmin,
  validate({ body: createQuestBody }),
  QuestController.createQuest
);
questApiRouter.put(
  "/:name/activate",
  authenticateSession,
  requireAdmin,
  QuestController.activateQuest
);
questApiRouter.put(
  "/:name/reset",
  authenticateSession,
  requireAdmin,
  QuestController.resetQuest
);
questApiRouter.put(
  "/:name/pause",
  authenticateSession,
  requireAdmin,
  QuestController.pauseQuest
);
questApiRouter.put(
  "/:name/resume",
  authenticateSession,
  requireAdmin,
  QuestController.resumeQuest
);
questApiRouter.post(
  "/:name/puzzle/:puzzleName/activate",
  authenticateSession,
  // Checked before the image is read into memory.
  requireUser,
  activationRateLimiter,
  uploadActivationImage,
  validate({ body: activatePuzzleBody }),
  QRCodeReader.readQRCode,
  QuestController.activateQuestPuzzle
);
questApiRouter.put(
  "/:name/puzzle/:puzzleName/solve",
  authenticateSession,
  requireUser,
  solutionRateLimiter,
  validate({ body: solvePuzzleBody }),
  QuestController.solveQuestPuzzle
);
questApiRouter.put(
  "/:name/puzzle/:puzzleName/hint",
  authenticateSession,
  requireUser,
  validate({ body: requestHintBody }),
  QuestController.requestQuestPuzzleHint
);
questApiRouter.get(
  "/:name/puzzle/:puzzleName/qrcode",
  authenticateSession,
  requireAdmin,
  QuestController.generatePuzzleActivationQRCode
);

export { questApiRouter as QuestApiRouter };
