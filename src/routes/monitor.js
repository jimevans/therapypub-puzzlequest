import express from "express";
import * as QuestController from "../controllers/quest.controller.js";

const monitorRouter = express.Router();

monitorRouter.get(
  "/quest/:name",
  QuestController.renderMonitoredQuest
);

monitorRouter.get(
  "/quest/:name/puzzle/:puzzleName",
  QuestController.renderMonitoredQuestPuzzle
);

export { monitorRouter as MonitorRouter };
