// Following a quest from outside it: what anyone may see, without signing in,
// unless the quest is private, when only its players and staff may.
// Players can open these too, so they show nothing more than a player can see.
import type { Request } from "express";
import { z } from "zod";
import { liveTicketRateLimiter } from "../../middleware/rateLimiter.js";
import { issueLiveTicket } from "../../services/liveTicket.service.js";
import { findValidShareLink } from "../../services/shareLink.service.js";
import * as QuestService from "../../services/quest.service.js";
import * as UserService from "../../services/user.service.js";
import { Problems, sendProblem, sendServiceProblem } from "../problems.js";
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

/**
 * Gets a request's share link token, sent in a header so that it stays out of
 * addresses and the logs that record them.
 * @param req the request
 * @returns the token, if there is one
 */
function shareTokenOf(req: Pick<Request, "get">): string | undefined {
  return req.get("x-share-token") || undefined;
}

const liveTicketSchema = z
  .object({
    ticket: z.string().meta({
      description: "Send this with the subscribe message, once.",
    }),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: "LiveTicket" });

export const spectatingRoutes = [
  defineRoute({
    method: "post",
    path: "/quests/{name}/live-tickets",
    operationId: "createLiveTicket",
    summary: "Get a ticket to follow a quest's live updates",
    description:
      "A ticket lets one connection to the live-update websocket, /api/v1/updates, follow the quest. It expires within a minute and can be used once, so ask for a new one for each connection. A private quest gives one only to its players, its staff, and holders of a share link, and is otherwise not found.",
    tags: ["Spectating"],
    access: "public",
    acceptsShareLink: true,
    before: [liveTicketRateLimiter],
    request: { params: questParams },
    responses: {
      201: { description: "The ticket.", body: liveTicketSchema },
    },
    problems: [Problems.notFound, Problems.tooManyRequests],
    async handle(req, res) {
      const found = await QuestService.getSpectatedQuest(
        req.params.name,
        UserService.getLoggedInUser(req.user),
        shareTokenOf(req)
      );
      if (found.status === "error") {
        sendServiceProblem(res, found);
        return;
      }
      const shareToken = shareTokenOf(req);
      const issued = await issueLiveTicket(
        req.params.name,
        shareToken && (await findValidShareLink(shareToken, req.params.name))
      );
      if (!issued) {
        sendProblem(res, Problems.notFound, "The quest no longer exists");
        return;
      }
      res.status(201).json({
        ticket: issued.ticket,
        expiresAt: issued.expiresAt.toISOString(),
      });
    },
  }),
  defineRoute({
    method: "get",
    path: "/quests/{name}/spectator-view",
    operationId: "getSpectatorQuest",
    summary: "Follow a quest",
    description:
      "What anyone may see of a quest: its progress and the puzzles its players have reached. How many puzzles it has is never shown. A quest that hasn't started shows its name and status, with no puzzles. A private quest is not found, except by its players, its staff, and holders of a share link.",
    tags: ["Spectating"],
    access: "public",
    acceptsShareLink: true,
    request: { params: questParams },
    responses: {
      200: { description: "The quest.", body: spectatorQuestSchema },
    },
    problems: [Problems.notFound],
    async handle(req, res) {
      const found = await QuestService.getSpectatedQuest(
        req.params.name,
        UserService.getLoggedInUser(req.user),
        shareTokenOf(req)
      );
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
    acceptsShareLink: true,
    request: { params: questPuzzleParams },
    responses: {
      200: { description: "The puzzle.", body: spectatorPuzzleSchema },
    },
    problems: [Problems.notFound],
    async handle(req, res) {
      const found = await QuestService.getSpectatedQuestPuzzle(
        req.params.name,
        req.params.puzzleName,
        UserService.getLoggedInUser(req.user),
        shareTokenOf(req)
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
