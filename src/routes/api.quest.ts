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
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import { uploadActivationImage } from "../middleware/upload.js";
import * as QuestController from "../controllers/quest.controller.js";
import * as QRCodeReader from "../middleware/qrCodeReader.js";

const questApiRouter = express.Router();
questApiRouter.get(
  "/list",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  QuestController.listQuests
);
questApiRouter.get(
  "/:name",
  TokenAuthenticator.tokenAuthenticate,
  requireUser,
  QuestController.retrieveQuest
);
questApiRouter.put(
  "/:name",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  validate({ body: updateQuestBody }),
  QuestController.updateQuest
);
questApiRouter.delete(
  "/:name",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  QuestController.deleteQuest
);
questApiRouter.post(
  "/create",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  validate({ body: createQuestBody }),
  QuestController.createQuest
);
questApiRouter.put(
  "/:name/activate",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  QuestController.activateQuest
);
questApiRouter.put(
  "/:name/reset",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  QuestController.resetQuest
);
questApiRouter.post(
  "/:name/puzzle/:puzzleName/activate",
  TokenAuthenticator.tokenAuthenticate,
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
  TokenAuthenticator.tokenAuthenticate,
  requireUser,
  solutionRateLimiter,
  validate({ body: solvePuzzleBody }),
  QuestController.solveQuestPuzzle
);
questApiRouter.put(
  "/:name/puzzle/:puzzleName/hint",
  TokenAuthenticator.tokenAuthenticate,
  requireUser,
  validate({ body: requestHintBody }),
  QuestController.requestQuestPuzzleHint
);
questApiRouter.get(
  "/:name/puzzle/:puzzleName/qrcode",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  QuestController.generatePuzzleActivationQRCode
);

export { questApiRouter as QuestApiRouter };
