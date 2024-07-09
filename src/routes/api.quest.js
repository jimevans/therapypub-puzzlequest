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
questApiRouter.put(
  "/:name/activate",
  TokenAuthenticator.tokenAuthenticate,
  QuestController.activateQuest
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

export { questApiRouter as QuestApiRouter };
