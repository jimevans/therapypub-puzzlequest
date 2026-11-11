// Following a quest from outside it: what anyone may see, without signing in,
// unless the quest is private, when only its players (in any of its entries)
// and staff may.
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
  questName: z.string().meta({ description: "The quest's name." }),
});

const questPuzzleParams = questParams.extend({
  puzzleName: z.string().meta({ description: "The puzzle's name." }),
});

/** Whose progress on a puzzle to show. */
const spectatorPuzzleQuery = z.object({
  entryId: z.string().min(1).meta({
    description:
      "The ID of the entry whose progress to show, from the quest's spectator view.",
  }),
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

export const liveTicketSchema = z
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
    path: "/quests/{questName}/live-tickets",
    operationId: "createLiveTicket",
    summary: "Get a ticket to follow a quest's live updates",
    description:
      "A ticket lets one connection to the live-update websocket, /api/v1/updates, follow the quest, every entry of it. It expires within a minute and can be used once, so ask for a new one for each connection. A private quest gives one only to its players (in any of its entries), its staff, and holders of a share link, and is otherwise not found.",
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
        req.params.questName,
        UserService.getLoggedInUser(req.user),
        shareTokenOf(req)
      );
      if (found.status === "error") {
        sendServiceProblem(res, found);
        return;
      }
      const shareToken = shareTokenOf(req);
      const issued = await issueLiveTicket(
        req.params.questName,
        shareToken &&
          (await findValidShareLink(shareToken, req.params.questName)),
        UserService.getLoggedInUser(req.user)?.id
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
    path: "/quests/{questName}/spectator-view",
    operationId: "getSpectatorQuest",
    summary: "Follow a quest",
    description:
      "What anyone may see of a quest: each entry's progress and the puzzles it has reached, with who plays it by display name only. How many puzzles it has is never shown. An entry that hasn't started shows its status, with no puzzles. While the quest is a race that not every entry has finished (racing), anyone but staff and administrators sees only the standings, with no stops (stopsHidden), so rivals can't read each other's puzzles and answers; and a signed-in player whose own entry hasn't completed the quest sees only that entry (rivalsHidden), until it has. The entries come in leaderboard order, each with its rank once it has completed, and the ranks are provisional until every entry has. A private quest is not found, except by its players (in any of its entries), its staff, and holders of a share link.",
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
        req.params.questName,
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
    path: "/quests/{questName}/puzzles/{puzzleName}/spectator-view",
    operationId: "getSpectatorPuzzle",
    summary: "Follow a puzzle",
    description:
      "What anyone may see of a puzzle once an entry's players have activated it: what it asks, the hints that entry revealed, and the solution, once that entry solved it. A puzzle the entry hasn't activated, or an entry the quest doesn't have, is not found; so is every puzzle while the quest is a race that not every entry has finished, except for staff and administrators.",
    tags: ["Spectating"],
    access: "public",
    acceptsShareLink: true,
    request: { params: questPuzzleParams, query: spectatorPuzzleQuery },
    responses: {
      200: { description: "The puzzle.", body: spectatorPuzzleSchema },
    },
    problems: [Problems.notFound],
    async handle(req, res) {
      const found = await QuestService.getSpectatedQuestPuzzle(
        req.params.questName,
        req.params.puzzleName,
        req.query.entryId,
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
