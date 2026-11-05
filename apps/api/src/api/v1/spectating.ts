// Following a quest from outside it: what anyone may see, without signing in.
// Players can open these too, so they show nothing more than a player can see.
import { z } from "zod";
import * as QuestService from "../../services/quest.service.js";
import { Problems, sendServiceProblem } from "../problems.js";
import {
  spectatorPuzzleSchema,
  spectatorQuestSchema,
  toSpectatorPuzzleResource,
  toSpectatorQuestResource,
} from "./resources.js";
import { defineRoute } from "./route.js";

const questParams = z.object({
  name: z.string().meta({ description: "The quest's name." }),
});

const questPuzzleParams = questParams.extend({
  puzzleName: z.string().meta({ description: "The puzzle's name." }),
});

export const spectatingRoutes = [
  defineRoute({
    method: "get",
    path: "/quests/{name}/spectator-view",
    operationId: "getSpectatorQuest",
    summary: "Follow a quest",
    description:
      "What anyone may see of a quest: its progress and the puzzles its players have reached. How many puzzles it has is never shown. A quest that hasn't started shows its name and status, with no puzzles.",
    tags: ["Spectating"],
    access: "public",
    request: { params: questParams },
    responses: {
      200: { description: "The quest.", body: spectatorQuestSchema },
    },
    problems: [Problems.notFound],
    async handle(req, res) {
      const found = await QuestService.getSpectatedQuest(req.params.name);
      if (found.status === "error") {
        sendServiceProblem(res, found);
        return;
      }
      res.json(toSpectatorQuestResource(found.data));
    },
  }),
  defineRoute({
    method: "get",
    path: "/quests/{name}/puzzles/{puzzleName}/spectator-view",
    operationId: "getSpectatorPuzzle",
    summary: "Follow a puzzle",
    description:
      "What anyone may see of a puzzle once its players have activated it: what it asks, the hints revealed, and the solution, once solved. A puzzle not yet activated is not found.",
    tags: ["Spectating"],
    access: "public",
    request: { params: questPuzzleParams },
    responses: {
      200: { description: "The puzzle.", body: spectatorPuzzleSchema },
    },
    problems: [Problems.notFound],
    async handle(req, res) {
      const found = await QuestService.getSpectatedQuestPuzzle(
        req.params.name,
        req.params.puzzleName
      );
      if (found.status === "error") {
        sendServiceProblem(res, found);
        return;
      }
      const { quest, puzzle, detail } = found.data;
      res.json(toSpectatorPuzzleResource(quest, puzzle, detail));
    },
  }),
];
