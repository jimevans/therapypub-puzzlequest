import type { Response } from "express";
import type { RouteRequest } from "../types.js";
import { RenderMode } from "../middleware/useRenderMode.js";
import * as QuestService from "../services/quest.service.js";
import * as UserService from "../services/user.service.js";

/**
 * The quest editor, for creating a quest or changing one. Only administrators
 * can reach it.
 */
export async function renderQuest(
  req: RouteRequest<"name">,
  res: Response
): Promise<void> {
  const loggedInUser = UserService.requireLoggedInUser(req.user);
  const viewName = "questEdit";

  if (req.renderMode === RenderMode.CREATE) {
    res.render(viewName, { renderMode: req.renderMode, quest: null });
    return;
  }

  const questResponse = await QuestService.getQuestByQuestName(
    req.params.name,
    loggedInUser
  );
  if (questResponse.status === "error") {
    res.status(questResponse.statusCode).render("error", {
      errorTitle: "Not found",
      errorDetails: questResponse.message,
    });
    return;
  }

  const quest = questResponse.data;

  res.render(viewName, {
    userName: loggedInUser.userName,
    renderMode: req.renderMode,
    quest: quest,
    progress: quest.getProgress(),
  });
}
