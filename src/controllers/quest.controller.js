import { RenderMode } from "../middleware/useRenderMode.js";
import * as AuthenticationService from "../services/authentication.service.js";
import * as QuestService from "../services/quest.service.js";

export async function createQuest(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        error: `User must be logged in to create quests`,
      })
    );
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to create quests`,
      })
    );
    return;
  }

  if (!req.body) {
    res.status(400).send(JSON.stringify({ error: "No request body" }));
    return;
  }
  if (!("name" in req.body && !"displayName" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({ error: "No puzzle name in request body" }));
    return;
  }
  if (!("userName" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({ error: "No assigned user name in request body" }));
    return;
  }
  const response = await QuestService.createQuest(req.body);
  if ("error" in response) {
    res.status(400).send(JSON.stringify(response));
    return;
  }
  res.send(JSON.stringify(response));
}

export async function retrieveQuest(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        error: `User must be logged in to retrieve quests`,
      })
    );
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to view quests`,
      })
    );
    return;
  }

  const viewName =
    req.renderMode === RenderMode.DISPLAY ? "questDetails" : "questEdit";
  if (req.renderMode === RenderMode.CREATE) {
    res.render(viewName, { renderMode: req.renderMode, quest: null });
    return;
  }

  const questResponse = await QuestService.getQuest(
    req.params.name
  );
  if ("error" in questResponse) {
    res.status(500).send(JSON.stringify(questResponse));
  }

  if (req.renderMode) {
    res.render(viewName, {
      renderMode: req.renderMode,
      quest: questResponse.quest,
    });
    return;
  }

  res.send(JSON.stringify(questResponse));
}

export async function updateQuest(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        error: `User must be logged in to update quest`,
      })
    );
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to update quest`,
      })
    );
    return;
  }

  if (!req.body) {
    res.status(400).send(JSON.stringify({ error: "No request body" }));
    return;
  }
  const response = await QuestService.updateQuest(req.params.name, req.body);
  if ("error" in response) {
    res.status(500).send(JSON.stringify(response));
  }
  res.send(JSON.stringify(response));
}

export async function deleteQuest(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        error: `User must be logged in to delete quests`,
      })
    );
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to delete quests`,
      })
    );
    return;
  }

  if (!req.body) {
    res.status(400).send(JSON.stringify({ error: "No request body" }));
    return;
  }
  const response = await QuestService.deleteQuest(req.params.name);
  if ("error" in response) {
    res.status(500).send(JSON.stringify(response));
  }
  res.send(JSON.stringify(response));
}

export async function listQuests(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        error: `User must be logged in to list quests`,
      })
    );
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to list quests`,
      })
    );
    return;
  }
  const response = await QuestService.getQuests();
  res.send(JSON.stringify(response));
}
