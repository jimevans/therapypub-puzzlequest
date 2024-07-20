import express from "express";
import multer from "multer";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import * as QuestController from "../controllers/quest.controller.js";
import * as QRCodeReader from "../middleware/qrCodeReader.js";

const uploadActivate = multer();

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
  uploadActivate.single("image"),
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
