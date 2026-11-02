import express from "express";
import { requireUser } from "../middleware/authorization.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import { uploadActivationImage } from "../middleware/upload.js";
import * as QuestController from "../controllers/quest.controller.js";
import * as QRCodeReader from "../middleware/qrCodeReader.js";

const questApiRouter = express.Router();
questApiRouter.get(
  "/list",
  TokenAuthenticator.tokenAuthenticate,
  QuestController.listQuests
);
questApiRouter.get(
  "/:name",
  TokenAuthenticator.tokenAuthenticate,
  QuestController.retrieveQuest
);
questApiRouter.put(
  "/:name",
  TokenAuthenticator.tokenAuthenticate,
  QuestController.updateQuest
);
questApiRouter.delete(
  "/:name",
  TokenAuthenticator.tokenAuthenticate,
  QuestController.deleteQuest
);
questApiRouter.post(
  "/create",
  TokenAuthenticator.tokenAuthenticate,
  QuestController.createQuest
);
questApiRouter.put(
  "/:name/activate",
  TokenAuthenticator.tokenAuthenticate,
  QuestController.activateQuest
);
questApiRouter.put(
  "/:name/reset",
  TokenAuthenticator.tokenAuthenticate,
  QuestController.resetQuest
);
questApiRouter.post(
  "/:name/puzzle/:puzzleName/activate",
  TokenAuthenticator.tokenAuthenticate,
  // Checked before the image is read into memory.
  requireUser,
  uploadActivationImage,
  QRCodeReader.readQRCode,
  QuestController.activateQuestPuzzle
);
questApiRouter.put(
  "/:name/puzzle/:puzzleName/solve",
  TokenAuthenticator.tokenAuthenticate,
  QuestController.solveQuestPuzzle
);
questApiRouter.put(
  "/:name/puzzle/:puzzleName/hint",
  TokenAuthenticator.tokenAuthenticate,
  QuestController.requestQuestPuzzleHint
);
questApiRouter.get(
  "/:name/puzzle/:puzzleName/qrcode",
  TokenAuthenticator.tokenAuthenticate,
  QuestController.generatePuzzleActivationQRCode
);

export { questApiRouter as QuestApiRouter };
