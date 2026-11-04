import express from "express";
import { validate } from "../middleware/validate.js";
import {
  activatePuzzleBody,
  requestHintBody,
  solvePuzzleBody,
} from "../schemas/quest.schemas.js";
import { requireUser } from "../middleware/authorization.js";
import {
  activationRateLimiter,
  solutionRateLimiter,
} from "../middleware/rateLimiter.js";
import { authenticateSession } from "../middleware/sessionAuthentication.js";
import { uploadActivationImage } from "../middleware/upload.js";
import * as QuestController from "../controllers/quest.controller.js";
import * as QRCodeReader from "../middleware/qrCodeReader.js";

// Playing a quest. Everything else about quests is in the v1 API, and these
// move there next.
const questApiRouter = express.Router();
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
export { questApiRouter as QuestApiRouter };
