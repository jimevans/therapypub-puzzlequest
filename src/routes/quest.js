import express from "express";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import * as UseRenderMode from "../middleware/useRenderMode.js";
import * as QuestController from "../controllers/quest.controller.js";

const questRouter = express.Router();

questRouter.get(
  "/new",
  TokenAuthenticator.tokenAuthenticate,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.CREATE),
  QuestController.retrieveQuest
);

questRouter.get(
  "/:name",
  TokenAuthenticator.tokenAuthenticate,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.DISPLAY),
  QuestController.retrieveQuest
);

questRouter.get(
  "/:name/edit",
  TokenAuthenticator.tokenAuthenticate,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.EDIT),
  QuestController.retrieveQuest
);

questRouter.get(
  "/:name/puzzle/:puzzleName",
  TokenAuthenticator.tokenAuthenticate,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.DISPLAY),
  QuestController.renderQuestPuzzle
);

questRouter.get(
  "/:name/puzzle/:puzzleName/activate",
  TokenAuthenticator.tokenAuthenticate,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.DISPLAY),
  QuestController.renderQuestPuzzleActivation
);

export { questRouter as QuestRouter };
