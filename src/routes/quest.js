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
)


export { questRouter as QuestRouter };
