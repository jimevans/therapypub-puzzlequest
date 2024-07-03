import express from "express";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import * as QuestController from "../controllers/quest.controller.js";

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

export { questApiRouter as QuestApiRouter };
