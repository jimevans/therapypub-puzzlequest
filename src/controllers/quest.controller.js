import { marked } from "marked";
import { RenderMode } from "../middleware/useRenderMode.js";
import { PuzzleType } from "../models/puzzle.model.js";
import { QuestPuzzleStatus } from "../models/quest.model.js";
import * as AuthenticationService from "../services/authentication.service.js";
import * as QuestService from "../services/quest.service.js";

async function getQuestForUser(questName, userName, isUserAdmin) {
  const questResponse = await QuestService.getQuestData(questName);
  if ("error" in questResponse) {
    return { status: "error", message: questResponse.error };
  }

  const isAuthorizedUserResponse = await QuestService.isQuestForUser(
    questResponse.quest,
    userName
  );
  if ("error" in isAuthorizedUserResponse) {
    return { status: "error", message: isAuthorizedUserResponse.error };
  }
  const isQuestForUser = isAuthorizedUserResponse.isQuestForUser;
  if (!isQuestForUser && !isUserAdmin) {
    if (!isUserAdmin) {
      return {
        status: "unauthorized",
        message: `User ${req.user.userName} not authorized to view quests`,
      };
    }

    if (!isQuestForUser) {
      return {
        status: "unauthorized",
        message: `User ${req.user.userName} not authorized for quest ${questResponse.quest.name}`,
      };
    }
  }
  return { status: "success", quest: questResponse.quest };
}

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
  if (!("name" in req.body) && !("displayName" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({ error: "No quest name in request body" }));
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

  const isUserAdmin = AuthenticationService.isUserAdmin(req.user);
  const viewName = isUserAdmin
    ? req.renderMode === RenderMode.DISPLAY
      ? "questDetails"
      : "questEdit"
    : "quest";

  if (req.renderMode === RenderMode.CREATE) {
    if (!isUserAdmin) {
      res.status(403).send(
        JSON.stringify({
          error: `User ${req.user.userName} not authorized to create new quests`,
        })
      );
      return;
    }
    res.render(viewName, { renderMode: req.renderMode, quest: null });
    return;
  }

  const questResponse = await getQuestForUser(
    req.params.name,
    req.user.userName,
    isUserAdmin
  );

  // Got an internal error in retrieving the request.
  if (questResponse.status === "error") {
    res.status(500).send({ error: JSON.stringify(questResponse.message) });
    return;
  }

  // Got an unauthorized response.
  if (questResponse.status === "unauthorized") {
    res.status(403).send({ error: JSON.stringify(questResponse.message) });
    return;
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

export async function activateQuest(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        error: `User must be logged in to activate quests`,
      })
    );
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to activate quests`,
      })
    );
    return;
  }

  return await QuestService.startQuest(req.params.name);
}

async function getQuestPuzzle(user, questName, puzzleName) {
  if (user === null) {
    return {
      statusCode: 401,
      error: `User must be logged in to retrieve quests`,
    };
  }

  const isUserAdmin = AuthenticationService.isUserAdmin(user);
  const questResponse = await getQuestForUser(
    questName,
    user.userName,
    isUserAdmin
  );

  // Got an internal error in retrieving the request.
  if (questResponse.status === "error") {
    return { statusCode: 500, error: questResponse.message };
  }

  // Got an unauthorized response.
  if (questResponse.status === "unauthorized") {
    return { statusCode: 403, error: questResponse.message };
  }

  const quest = questResponse.quest;
  const filteredPuzzles = quest.puzzles.filter(
    (puzzle) => puzzle.name === puzzleName && puzzle.status > QuestPuzzleStatus.UNAVAILABLE
  );

  if (filteredPuzzles.length === 0) {
    return { statusCode: 400, error: `Invalid puzzle name for ${questName}` };
  }

  const puzzle = filteredPuzzles[0];
  return { status: "success", puzzle: puzzle };
}

export async function activateQuestPuzzle(req, res) {
  if (!(req.qrCodeData || req.body?.activationCode)) {
    res.status(400).send(JSON.stringify({ error: "No activation code sent in request" }));
    return;
  }

  const activationCode = req.qrCodeData ? req.qrCodeData : req.body.activationCode;
  const puzzleResponse = await getQuestPuzzle(
    req.user,
    req.params.name,
    req.params.puzzleName
  );
  if ("error" in puzzleResponse) {
    res
      .status(puzzleResponse.statusCode)
      .send(JSON.stringify({ error: puzzleResponse.error }));
    return;
  }

  const puzzle = puzzleResponse.puzzle;
  if (puzzle.status !== QuestPuzzleStatus.AWAITING_ACTIVATION) {
    return {
      statusCode: 400,
      error: `Puzzle ${puzzleName} is already activated`,
    };
  }

  const activationResult = await QuestService.activateCurrentPuzzle(req.params.name, activationCode);
  if ("error" in activationResult) {
    res.status(406).send(JSON.stringify({ error: activationResult.error }));
    return;
  }
  res.send(JSON.stringify({ status: "success" }));
}

export async function solveQuestPuzzle(req, res) {
  if (!req.body?.guess) {
    res.status(400).send(JSON.stringify({ error: "No solution guess sent in request" }));
    return;
  }

  const solutionGuess = req.body.guess;
  const puzzleResponse = await getQuestPuzzle(
    req.user,
    req.params.name,
    req.params.puzzleName
  );
  if ("error" in puzzleResponse) {
    res
      .status(puzzleResponse.statusCode)
      .send(JSON.stringify({ error: puzzleResponse.error }));
    return;
  }

  const puzzle = puzzleResponse.puzzle;
  if (puzzle.status < QuestPuzzleStatus.IN_PROGRESS) {
    res.status(400).send(JSON.stringify({
      error: `Puzzle ${puzzleName} is not yet activated`
    }));
    return;
  } else if (puzzle.status > QuestPuzzleStatus.IN_PROGRESS) {
    res.status(400).send(JSON.stringify({
      error: `Puzzle ${puzzleName} is already solved`
    }));
    return;
  }

  const solutionResult = await QuestService.finishCurrentPuzzle(req.params.name, solutionGuess);
  if ("error" in solutionResult) {
    res.status(406).send(JSON.stringify({ error: solutionResult.error }));
    return;
  }
  res.send(JSON.stringify({ status: "success", solution: solutionResult.solutionText }));
}

export async function requestQuestPuzzleHint(req, res) {
  const puzzleResponse = await getQuestPuzzle(
    req.user,
    req.params.name,
    req.params.puzzleName
  );
  if ("error" in puzzleResponse) {
    res
      .status(puzzleResponse.statusCode)
      .send(JSON.stringify({ error: puzzleResponse.error }));
    return;
  }

  const puzzle = puzzleResponse.puzzle;
  if (puzzle.status < QuestPuzzleStatus.IN_PROGRESS) {
    res.status(400).send(JSON.stringify({
      error: `Puzzle ${puzzleName} is not yet activated`
    }));
    return;
  } else if (puzzle.status > QuestPuzzleStatus.IN_PROGRESS) {
    res.status(400).send(JSON.stringify({
      error: `Puzzle ${puzzleName} is already solved`
    }));
    return;
  }

  const hintResult = await QuestService.getPuzzleHint(req.params.name);
  if ("error" in hintResult) {
    res.status(400).send(JSON.stringify({
      error: hintResponse.error
    }));
    return;
  }

  res.send(JSON.stringify(hintResult));
}

export async function renderQuestPuzzleActivation(req, res) {
  const puzzleResponse = await getQuestPuzzle(
    req.user,
    req.params.name,
    req.params.puzzleName
  );
  if ("error" in puzzleResponse) {
    res
      .status(puzzleResponse.statusCode)
      .send(JSON.stringify({ error: puzzleResponse.error }));
    return;
  }

  const puzzle = puzzleResponse.puzzle;
  if (puzzle.status !== QuestPuzzleStatus.AWAITING_ACTIVATION) {
    res.status(400).send(JSON.stringify({ error: `Puzzle ${puzzleName} is already activated` }));
    return;
  }

  res.render("activate", { quest: req.params.name, puzzle: puzzleResponse.puzzle });
}

export async function renderQuestPuzzle(req, res) {
  const puzzleResponse = await getQuestPuzzle(
    req.user,
    req.params.name,
    req.params.puzzleName
  );
  if ("error" in puzzleResponse) {
    res
      .status(puzzleResponse.statusCode)
      .send(JSON.stringify({ error: puzzleResponse.error }));
    return;
  }

  const puzzle = puzzleResponse.puzzle;
  if (puzzle.status < QuestPuzzleStatus.IN_PROGRESS) {
    res.status(400).send(JSON.stringify({ error: `Puzzle ${puzzleName} requires activation` }));
    return;
  }

  let renderedPuzzle;
  switch (puzzle.type) {
    case PuzzleType.IMAGE:
      renderedPuzzle = `<img src="${puzzle.text}" class="pq-puzzle-img" />`;
      break;
    case PuzzleType.AUDIO:
      renderedPuzzle = `<audio src="${puzzle.text}" />`;
      break;
    case PuzzleType.VIDEO:
      renderedPuzzle = `<video src="${puzzle.text}" />`;
      break;
    default:
      renderedPuzzle = await marked.parse(puzzle.text, { gfm: true });
  }

  res.render("puzzle", { quest: req.params.name, puzzle: puzzleResponse.puzzle, rendered: renderedPuzzle });
}
