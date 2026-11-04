// Quests: managing them, running them (start, reset, pause, resume), the
// administrator's rescue actions on their puzzles, texting their players,
// and their event logs. Playing them (activating, solving, hints) is still
// on the older API.
import { z } from "zod";
import { sendTextBody } from "../../schemas/messaging.schemas.js";
import {
  createQuestBody,
  resetPuzzleBody,
  updateQuestBody,
} from "../../schemas/quest.schemas.js";
import * as MessagingService from "../../services/messaging.service.js";
import * as QuestService from "../../services/quest.service.js";
import * as UserService from "../../services/user.service.js";
import type { ServiceResult } from "../../types.js";
import { pageQuery, pageSchema } from "../paging.js";
import { Problems, type ProblemType, sendServiceProblem } from "../problems.js";
import { questEventSchema, questSchema, resourcePath } from "./resources.js";
import { type AnyRoute, defineRoute } from "./route.js";

/** The path parameter naming a quest. */
const questParams = z.object({
  name: z.string().meta({ description: "The quest's name." }),
});

/** The path parameters naming a quest and one of its puzzles. */
const questPuzzleParams = questParams.extend({
  puzzleName: z.string().meta({ description: "The puzzle's name." }),
});

/**
 * Sends a quest, as an administrator sees it.
 * @param res the response
 * @param name the quest's name
 * @param status the status to send it with
 */
async function sendQuest(
  res: Parameters<AnyRoute["handle"]>[1],
  name: string,
  status = 200
): Promise<void> {
  const found = await QuestService.getQuestByQuestName(name);
  if (found.status === "error") {
    sendServiceProblem(res, found);
    return;
  }
  res.status(status).json(found.data.toJSON());
}

/**
 * Defines one of the administrator's actions on a quest, which answers with
 * the quest as it is afterwards.
 * @param action the action's path segment and operation
 * @param summary what it does
 * @param description more about what it does
 * @param run runs the action
 * @param problems the problems it can report
 * @returns the route
 */
function questAction(
  action: { path: string; operationId: string },
  summary: string,
  description: string,
  run: (
    name: string,
    actor: string | undefined
  ) => Promise<ServiceResult<unknown>>,
  problems: ProblemType[] = [Problems.notFound, Problems.wrongState]
): AnyRoute {
  return defineRoute({
    method: "post",
    path: `/quests/{name}/${action.path}`,
    operationId: action.operationId,
    summary,
    description,
    tags: ["Running quests"],
    access: "admin",
    request: { params: questParams },
    responses: { 200: { description: "The quest.", body: questSchema } },
    problems: [...problems, Problems.tryAgain],
    async handle(req, res) {
      const result = await run(req.params.name, req.user?.userName);
      if (result.status === "error") {
        sendServiceProblem(res, result);
        return;
      }
      await sendQuest(res, req.params.name);
    },
  });
}

export const questRoutes = [
  defineRoute({
    method: "get",
    path: "/quests",
    operationId: "listQuests",
    summary: "List quests",
    tags: ["Quests"],
    access: "admin",
    request: { query: pageQuery },
    responses: {
      200: { description: "A page of quests.", body: pageSchema(questSchema) },
    },
    async handle(req, res) {
      const page = await QuestService.listQuestsPage(req.query);
      res.json({
        items: page.items.map((quest) => quest.toJSON()),
        next: page.next,
      });
    },
  }),
  defineRoute({
    method: "post",
    path: "/quests",
    operationId: "createQuest",
    summary: "Create a quest",
    description:
      "Assigns it to a user or team, with its puzzles in order; each puzzle gets an activation code unless one is given.",
    tags: ["Quests"],
    access: "admin",
    request: { body: createQuestBody },
    responses: {
      201: {
        description: "Created.",
        body: questSchema,
        headers: { Location: { description: "The new quest." } },
      },
    },
    problems: [Problems.alreadyExists, Problems.invalidQuest],
    async handle(req, res) {
      const created = await QuestService.createQuest(req.body);
      if (created.status === "error") {
        sendServiceProblem(res, created);
        return;
      }
      res.location(resourcePath("quests", req.body.name));
      await sendQuest(res, req.body.name, 201);
    },
  }),
  defineRoute({
    method: "get",
    path: "/quests/{name}",
    operationId: "getQuest",
    summary: "Get a quest",
    description:
      "An administrator sees all of it. A player sees a quest assigned to them or their team once it has started, with only the puzzles they have reached; any other quest is not found.",
    tags: ["Quests"],
    access: "signedIn",
    request: { params: questParams },
    responses: { 200: { description: "The quest.", body: questSchema } },
    problems: [Problems.notFound],
    async handle(req, res) {
      const user = UserService.requireLoggedInUser(req.user);
      const found = await QuestService.getQuestByQuestName(
        req.params.name,
        user
      );
      if (found.status === "error") {
        sendServiceProblem(res, found);
        return;
      }
      res.json(
        user.isAdmin() ? found.data.toJSON() : found.data.toPlayerJSON()
      );
    },
  }),
  defineRoute({
    method: "patch",
    path: "/quests/{name}",
    operationId: "updateQuest",
    summary: "Change a quest",
    description:
      "Changes the fields given. Once the quest has started, the puzzles the players have reached stay in place at the start of the list; a completed quest's puzzles can't change until it is reset. Progress changes only through the actions.",
    tags: ["Quests"],
    access: "admin",
    request: { params: questParams, body: updateQuestBody },
    responses: { 200: { description: "The quest.", body: questSchema } },
    problems: [
      Problems.notFound,
      Problems.invalidQuest,
      Problems.wrongState,
      Problems.tryAgain,
    ],
    async handle(req, res) {
      const updated = await QuestService.updateQuest({
        ...req.body,
        name: req.params.name,
      });
      if (updated.status === "error") {
        sendServiceProblem(res, updated);
        return;
      }
      await sendQuest(res, req.params.name);
    },
  }),
  defineRoute({
    method: "delete",
    path: "/quests/{name}",
    operationId: "deleteQuest",
    summary: "Delete a quest",
    description: "Its event log is kept.",
    tags: ["Quests"],
    access: "admin",
    request: { params: questParams },
    responses: { 204: { description: "Deleted." } },
    problems: [Problems.notFound],
    async handle(req, res) {
      const deleted = await QuestService.deleteQuest(req.params.name);
      if (deleted.status === "error") {
        sendServiceProblem(res, deleted);
        return;
      }
      res.status(204).end();
    },
  }),
  questAction(
    { path: "start", operationId: "startQuest" },
    "Start a quest",
    "Makes its first puzzle available to activate. A player's phone call to the quest's number does the same.",
    (name, actor) => QuestService.startQuest(name, { actor })
  ),
  questAction(
    { path: "reset", operationId: "resetQuest" },
    "Reset a quest",
    "Returns it to not started, clearing the players' progress and pauses. The event log keeps what happened.",
    (name, actor) => QuestService.resetQuest(name, { actor })
  ),
  questAction(
    { path: "pause", operationId: "pauseQuest" },
    "Pause a quest",
    "Stops its clocks; the players can't activate, guess, or reveal hints until it resumes, and the paused time doesn't count.",
    (name, actor) => QuestService.pauseQuest(name, { actor })
  ),
  questAction(
    { path: "resume", operationId: "resumeQuest" },
    "Resume a paused quest",
    "Starts its clocks again.",
    (name, actor) => QuestService.resumeQuest(name, { actor })
  ),
  defineRoute({
    method: "post",
    path: "/quests/{name}/puzzles/{puzzleName}/skip",
    operationId: "skipQuestPuzzle",
    summary: "Skip a puzzle for the players",
    description:
      "Completes a puzzle the players have reached, with no penalty; they see its solution, and the next puzzle becomes available. Allowed while the quest is paused.",
    tags: ["Running quests"],
    access: "admin",
    request: { params: questPuzzleParams },
    responses: { 200: { description: "The quest.", body: questSchema } },
    problems: [Problems.notFound, Problems.wrongState, Problems.tryAgain],
    async handle(req, res) {
      const skipped = await QuestService.skipQuestPuzzle(
        req.params.name,
        req.params.puzzleName,
        { actor: req.user?.userName }
      );
      if (skipped.status === "error") {
        sendServiceProblem(res, skipped);
        return;
      }
      await sendQuest(res, req.params.name);
    },
  }),
  defineRoute({
    method: "post",
    path: "/quests/{name}/puzzles/{puzzleName}/reset",
    operationId: "resetQuestPuzzle",
    summary: "Reset a solved puzzle",
    description:
      "Returns a completed puzzle to in progress, so the players solve it again, and every later puzzle to not reached. For a puzzle that accepted a wrong answer: pause the quest, correct the puzzle, reset it here, and resume. Allowed while the quest is paused.",
    tags: ["Running quests"],
    access: "admin",
    request: { params: questPuzzleParams, body: resetPuzzleBody },
    responses: { 200: { description: "The quest.", body: questSchema } },
    problems: [Problems.notFound, Problems.wrongState, Problems.tryAgain],
    async handle(req, res) {
      const reset = await QuestService.resetQuestPuzzle(
        req.params.name,
        req.params.puzzleName,
        req.body.refundHints,
        { actor: req.user?.userName }
      );
      if (reset.status === "error") {
        sendServiceProblem(res, reset);
        return;
      }
      await sendQuest(res, req.params.name);
    },
  }),
  defineRoute({
    method: "get",
    path: "/quests/{name}/puzzles/{puzzleName}/qr-code",
    operationId: "getActivationQrCode",
    summary: "Get a puzzle's activation QR code",
    description:
      "A PNG image of the QR code holding the puzzle's activation code, to print and place where the players will find it.",
    tags: ["Quests"],
    access: "admin",
    request: { params: questPuzzleParams },
    responses: {
      200: {
        description: "The QR code.",
        body: z.string().meta({ format: "binary" }),
        mediaType: "image/png",
      },
    },
    problems: [Problems.notFound],
    async handle(req, res) {
      const qrCode = await QuestService.getPuzzleActivationQrCode(
        req.params.name,
        req.params.puzzleName
      );
      if (qrCode.status === "error") {
        sendServiceProblem(res, qrCode);
        return;
      }
      res.type("image/png").send(qrCode.data);
    },
  }),
  defineRoute({
    method: "get",
    path: "/quests/{name}/events",
    operationId: "listQuestEvents",
    summary: "List what happened in a quest",
    description:
      "The quest's event log, oldest first. It keeps names as they were at the time, and survives resetting the quest.",
    tags: ["Running quests"],
    access: "admin",
    request: { params: questParams, query: pageQuery },
    responses: {
      200: {
        description: "A page of events.",
        body: pageSchema(questEventSchema),
      },
    },
    problems: [Problems.notFound],
    async handle(req, res) {
      const page = await QuestService.listQuestEventsPage(
        req.params.name,
        req.query
      );
      if (page.status === "error") {
        sendServiceProblem(res, page);
        return;
      }
      res.json(page.data);
    },
  }),
  defineRoute({
    method: "post",
    path: "/quests/{name}/text-messages",
    operationId: "sendQuestTextMessage",
    summary: "Text the players",
    description:
      "Texts the message to the quest's players who accept text messages, a few seconds apart, as carriers require. With an expected response, the quest waits for that reply and texts the confirmation back when it arrives.",
    tags: ["Running quests"],
    access: "admin",
    request: { params: questParams, body: sendTextBody },
    responses: { 204: { description: "Sent." } },
    problems: [
      Problems.notFound,
      Problems.wrongState,
      Problems.noRecipients,
      Problems.messagingFailed,
    ],
    async handle(req, res) {
      const { message, expectedResponse, responseConfirmation } = req.body;
      const sent = await MessagingService.sendQuestTextMessage(
        req.params.name,
        message,
        expectedResponse && responseConfirmation
          ? { expectedResponse, responseConfirmation }
          : undefined
      );
      if (sent.status === "error") {
        sendServiceProblem(res, sent);
        return;
      }
      res.status(204).end();
    },
  }),
];
