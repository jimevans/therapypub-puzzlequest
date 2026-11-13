// Quests: managing them, running them (start, reset, pause, resume) as a
// whole or for one of their entrants, the administrator's rescue actions on
// an entrant's puzzles, texting an entrant's players, and their event logs.
// Playing them (activating, solving, hints) is in playing.ts.
import PDFDocument from "pdfkit";
import { z } from "zod";
import { sendTextBody, toOutgoing } from "../../schemas/messaging.schemas.js";
import {
  createQuestBody,
  resetPuzzleBody,
  updateQuestBody,
} from "../../schemas/quest.schemas.js";
import * as ChallengeService from "../../services/challenge.service.js";
import * as MessagingService from "../../services/messaging.service.js";
import { drawQrCards } from "../../services/qrCards.js";
import * as QuestService from "../../services/quest.service.js";
import * as UserService from "../../services/user.service.js";
import type { ServiceResult } from "../../types.js";
import { pageQuery, pageSchema } from "../paging.js";
import { Problems, type ProblemType, sendServiceProblem } from "../problems.js";
import {
  questEventSchema,
  questSchema,
  resourcePath,
  toQuestEventResource,
  toQuestResource,
  questChallengeSchema,
  toQuestChallengeResource,
} from "./resources.js";
import { type AnyRoute, defineRoute } from "./route.js";

/** The path parameter naming a quest. */
const questParams = z.object({
  questName: z.string().meta({ description: "The quest's name." }),
});

/** The path parameters naming a quest and one of its puzzles. */
const questPuzzleParams = questParams.extend({
  puzzleName: z.string().meta({ description: "The puzzle's name." }),
});

/**
 * The two kinds of entrant, and how an administrator's per-entrant addresses
 * name them: /quests/{questName}/teams/{teamName}/… for a team, and
 * /quests/{questName}/players/{userName}/… for a user playing on their own.
 */
const ENTRANT_ADDRESSES = [
  {
    kind: "team",
    segment: "teams",
    param: "teamName",
    noun: "Team",
    description: "The team's name.",
  },
  {
    kind: "user",
    segment: "players",
    param: "userName",
    noun: "Player",
    description: "The user name of the player playing on their own.",
  },
] as const;

/** How one of the per-entrant addresses names its entrant. */
type EntrantAddress = (typeof ENTRANT_ADDRESSES)[number];

/**
 * The path parameters naming a quest and one of its entrants.
 * @param address how the address names the entrant
 * @returns the parameters' schema
 */
function entrantParams(address: EntrantAddress) {
  return questParams.extend({
    [address.param]: z.string().meta({ description: address.description }),
  });
}

/**
 * Gets the entrant a request's path names.
 * @param address how the address names the entrant
 * @param params the request's path parameters
 * @returns the entrant
 */
function entrantOf(
  address: EntrantAddress,
  params: Record<string, string>
): QuestService.EntrantRef {
  return { kind: address.kind, name: params[address.param] };
}

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
  const found = await QuestService.getQuestEntries(name);
  if (found.status === "error") {
    sendServiceProblem(res, found);
    return;
  }
  res.status(status).json(toQuestResource(found.data, "admin"));
}

/**
 * Defines one of the administrator's actions on a quest, which answers with
 * the quest as it is afterwards.
 * @param route the action's path below /quests/{questName}, its operation, what it
 *  does, its request's schemas, and the problems it can report
 * @param run runs the action
 * @returns the route
 */
function questAction<P extends z.ZodObject, B extends z.ZodType>(
  route: {
    path: string;
    operationId: string;
    summary: string;
    description: string;
    params: P;
    body?: B;
    problems?: ProblemType[];
  },
  run: (
    params: z.output<P>,
    body: z.output<B>,
    actor: string | undefined
  ) => Promise<ServiceResult<unknown>>
): AnyRoute {
  return defineRoute({
    method: "post",
    path: `/quests/{questName}/${route.path}`,
    operationId: route.operationId,
    summary: route.summary,
    description: route.description,
    tags: ["Running quests"],
    access: "admin",
    request: {
      params: route.params,
      ...(route.body ? { body: route.body } : {}),
    },
    responses: { 200: { description: "The quest.", body: questSchema } },
    problems: [
      ...(route.problems ?? [Problems.notFound, Problems.wrongState]),
      Problems.tryAgain,
    ],
    async handle(req, res) {
      const result = await run(
        req.params as z.output<P>,
        req.body as z.output<B>,
        req.user?.userName
      );
      if (result.status === "error") {
        sendServiceProblem(res, result);
        return;
      }
      await sendQuest(res, req.params.questName as string);
    },
  });
}

/** What each action on a whole quest or one entrant's entry does. */
const ENTRY_ACTIONS = [
  {
    action: "start",
    run: QuestService.startQuest,
    summary: "Start",
    whole:
      "Starts every entry not yet started, making the first puzzle available to activate; entries already started are left as they are.",
    one: "Makes the first puzzle available to activate, for this entrant only.",
    call: " A player's phone call to the quest's number starts their own entry.",
  },
  {
    action: "reset",
    run: QuestService.resetQuest,
    summary: "Reset",
    whole:
      "Returns every entry to not started, clearing the players' progress and pauses.",
    one: "Returns the entrant's entry to not started, clearing its progress and pauses; other entries are left as they are.",
    call: " The event log keeps what happened.",
  },
  {
    action: "pause",
    run: QuestService.pauseQuest,
    summary: "Pause",
    whole:
      "Pauses every entry in progress and not already paused, stopping its clocks; its players can't activate, guess, or reveal hints until it resumes, and the paused time doesn't count.",
    one: "Stops the entrant's clocks; its players can't activate, guess, or reveal hints until it resumes, and the paused time doesn't count.",
    call: "",
  },
  {
    action: "resume",
    run: QuestService.resumeQuest,
    summary: "Resume",
    whole: "Resumes every paused entry, starting its clocks again.",
    one: "Starts the entrant's clocks again.",
    call: "",
  },
] as const;

/** The actions on a whole quest: every entry the rules allow. */
const wholeQuestActions = ENTRY_ACTIONS.map(
  ({ action, run, summary, whole, call }) =>
    questAction(
      {
        path: action,
        operationId: `${action}Quest`,
        summary: `${summary} a quest, for every entrant`,
        description: `${whole} Answers wrong-state only if no entry could be changed.${call}`,
        params: questParams,
      },
      ({ questName }, _body, actor) => run(questName, { actor }, "all")
    )
);

/**
 * The administrator's actions on one entrant's entry, for teams and for
 * players playing on their own.
 */
const entrantRoutes = ENTRANT_ADDRESSES.flatMap((address) => {
  const params = entrantParams(address);
  const puzzleParams = params.extend({
    puzzleName: z.string().meta({ description: "The puzzle's name." }),
  });
  const notEntrant = `Not found if the ${address.noun.toLowerCase()} isn't one of the quest's entrants.`;
  const entry = (raw: Record<string, string>) => ({
    entrant: entrantOf(address, raw),
  });
  return [
    ...ENTRY_ACTIONS.map(({ action, run, summary, one, call }) =>
      questAction(
        {
          path: `${address.segment}/{${address.param}}/${action}`,
          operationId: `${action}${address.noun}Entry`,
          summary: `${summary} a ${address.kind === "team" ? "team" : "player"}'s entry in a quest`,
          description: `${one}${call} ${notEntrant}`,
          params,
        },
        (raw, _body, actor) => run(raw.questName, { actor }, entry(raw))
      )
    ),
    questAction(
      {
        path: `${address.segment}/{${address.param}}/puzzles/{puzzleName}/skip`,
        operationId: `skip${address.noun}Puzzle`,
        summary: `Skip a puzzle for a ${address.kind === "team" ? "team" : "player"}`,
        description: `Completes a puzzle the entrant has reached, with no penalty; they see its solution, and the next puzzle becomes available. Allowed while the entry is paused. ${notEntrant}`,
        params: puzzleParams,
      },
      (raw, _body, actor) =>
        QuestService.skipQuestPuzzle(
          raw.questName,
          raw.puzzleName,
          { actor },
          entry(raw)
        )
    ),
    questAction(
      {
        path: `${address.segment}/{${address.param}}/puzzles/{puzzleName}/reset`,
        operationId: `reset${address.noun}Puzzle`,
        summary: `Reset a ${address.kind === "team" ? "team" : "player"}'s solved puzzle`,
        description: `Returns a completed puzzle to in progress for the entrant, so they solve it again, and every later puzzle to not reached. For a puzzle that accepted a wrong answer: pause the entry, correct the puzzle, reset it here, and resume. Allowed while the entry is paused. ${notEntrant}`,
        params: puzzleParams,
        body: resetPuzzleBody,
      },
      (raw, body, actor) =>
        QuestService.resetQuestPuzzle(
          raw.questName,
          raw.puzzleName,
          body.refundHints,
          { actor },
          entry(raw)
        )
    ),
    defineRoute({
      method: "post",
      path: `/quests/{questName}/${address.segment}/{${address.param}}/text-messages`,
      operationId: `send${address.noun}TextMessage`,
      summary: `Text a ${address.kind === "team" ? "team's members" : "player"}`,
      description: `Sends the puzzle master's message to the entrant's players; the entry must be in progress. It's kept with the entry, which players see in the app (and players with the app are sent it as a push notification), and texted, a few seconds apart as carriers require, to the players who accept text messages, except those with the app, unless the quest's textPlayersWithApp is turned on. With an expected response it sets a challenge, which the entry waits for its players to answer, in the app or by text; a right answer shows them the confirmation. The challenge is kept with the quest, so challengeId can send it to the next entrant. Refused (noRecipients) if no player has the app or accepts texts. ${notEntrant}`,
      tags: ["Running quests"],
      access: "admin",
      request: { params, body: sendTextBody },
      responses: { 204: { description: "Sent." } },
      problems: [
        Problems.notFound,
        Problems.wrongState,
        Problems.noRecipients,
        Problems.messagingFailed,
      ],
      async handle(req, res) {
        const raw = req.params as Record<string, string>;
        const sent = await MessagingService.sendQuestTextMessage(
          raw.questName,
          entrantOf(address, raw),
          toOutgoing(req.body)
        );
        if (sent.status === "error") {
          sendServiceProblem(res, sent);
          return;
        }
        res.status(204).end();
      },
    }),
  ];
});

export const questRoutes = [
  defineRoute({
    method: "post",
    path: "/quests/{questName}/text-messages",
    operationId: "sendQuestTextMessage",
    summary: "Text every entrant's players",
    description:
      "Sends the puzzle master's message to every entry in progress, as a team's or player's own address does (see there): kept with each entry and shown in the app, and texted to the players who accept texts, each number once. With an expected response, each of those entries waits for its own answer to the challenge. To message one team or player, use its own address.",
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
      const sent = await MessagingService.sendQuestTextMessageToAll(
        req.params.questName,
        toOutgoing(req.body)
      );
      if (sent.status === "error") {
        sendServiceProblem(res, sent);
        return;
      }
      res.status(204).end();
    },
  }),
  defineRoute({
    method: "get",
    path: "/quests/{questName}/challenges",
    operationId: "listQuestChallenges",
    summary: "List a quest's challenges",
    description:
      "The challenges the puzzle master has sent in the quest, oldest first, kept so that one can be sent to the next team or player with one tap: send its challengeId to a text-messages route. A challenge sent again with the same message, answer, and confirmation is the same challenge.",
    tags: ["Running quests"],
    access: "admin",
    request: { params: questParams },
    responses: {
      200: {
        description: "The challenges.",
        body: z
          .object({ challenges: z.array(questChallengeSchema) })
          .meta({ id: "QuestChallengeList" }),
      },
    },
    problems: [Problems.notFound],
    async handle(req, res) {
      const listed = await ChallengeService.listChallenges(
        req.params.questName
      );
      if (listed.status === "error") {
        sendServiceProblem(res, listed);
        return;
      }
      res.json({ challenges: listed.data.map(toQuestChallengeResource) });
    },
  }),
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
        items: page.items.map((entries) => toQuestResource(entries, "admin")),
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
      "With the users and teams playing it (at least one; a player may be in only one of them), and its puzzles in order; each puzzle gets an activation code unless one is given, the same for every entrant.",
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
    path: "/quests/{questName}",
    operationId: "getQuest",
    summary: "Get a quest",
    description:
      "An administrator sees all of it, with every entry. A player sees only their own entry (theirs or their team's) once it has started, with only the puzzles they have reached; a quest they don't play is not found.",
    tags: ["Quests"],
    access: "signedIn",
    request: { params: questParams },
    responses: { 200: { description: "The quest.", body: questSchema } },
    problems: [Problems.notFound],
    async handle(req, res) {
      const user = UserService.requireLoggedInUser(req.user);
      const found = await QuestService.getQuestEntries(
        req.params.questName,
        user
      );
      if (found.status === "error") {
        sendServiceProblem(res, found);
        return;
      }
      res.json(
        toQuestResource(found.data, user.isAdmin() ? "admin" : "player")
      );
    },
  }),
  defineRoute({
    method: "patch",
    path: "/quests/{questName}",
    operationId: "updateQuest",
    summary: "Change a quest",
    description:
      "Changes the fields given. Once an entry has started, the puzzles it has reached stay in place at the start of the list; once any entry has completed the quest, its puzzles can't change until that entry is reset. Entrants already playing keep their progress; new ones start out not started; one left out is removed, but only before it starts (reset it first). Progress changes only through the actions.",
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
        name: req.params.questName,
      });
      if (updated.status === "error") {
        sendServiceProblem(res, updated);
        return;
      }
      await sendQuest(res, req.params.questName);
    },
  }),
  defineRoute({
    method: "delete",
    path: "/quests/{questName}",
    operationId: "deleteQuest",
    summary: "Delete a quest",
    description: "Its event log is kept.",
    tags: ["Quests"],
    access: "admin",
    request: { params: questParams },
    responses: { 204: { description: "Deleted." } },
    problems: [Problems.notFound],
    async handle(req, res) {
      const deleted = await QuestService.deleteQuest(req.params.questName);
      if (deleted.status === "error") {
        sendServiceProblem(res, deleted);
        return;
      }
      res.status(204).end();
    },
  }),
  ...wholeQuestActions,
  ...entrantRoutes,
  defineRoute({
    method: "get",
    path: "/quests/{questName}/puzzles/{puzzleName}/qr-code",
    operationId: "getActivationQrCode",
    summary: "Get a puzzle's activation QR code",
    description:
      "A PNG image of the QR code holding the puzzle's activation code, for staff to show the players or to print.",
    tags: ["Quests"],
    access: "staff",
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
        req.params.questName,
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
    path: "/quests/{questName}/run-book",
    operationId: "getQuestRunBook",
    summary: "Get a quest's run book",
    description:
      "A PDF with a page for each of the quest's puzzles, in order: its content and solution, for whoever runs the quest.",
    tags: ["Quests"],
    access: "admin",
    request: { params: questParams },
    responses: {
      200: {
        description: "The run book.",
        body: z.string().meta({ format: "binary" }),
        mediaType: "application/pdf",
      },
    },
    problems: [Problems.notFound],
    async handle(req, res) {
      const pdf = new PDFDocument({ autoFirstPage: false, bufferPages: true });
      const chunks: Buffer[] = [];
      pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
      const ended = new Promise((resolve) => pdf.on("end", resolve));
      const written = await QuestService.getQuestRunBook(
        req.params.questName,
        pdf
      );
      if (written.status === "error") {
        sendServiceProblem(res, written);
        return;
      }
      await ended;
      res
        .type("application/pdf")
        .attachment(`${req.params.questName}.pdf`)
        .send(Buffer.concat(chunks));
    },
  }),
  defineRoute({
    method: "get",
    path: "/quests/{questName}/qr-cards",
    operationId: "getQuestQrCards",
    summary: "Get a quest's activation cards",
    description:
      "A PDF of cards to print, one for each of the quest's stops in order, each with the stop's activation QR code and code, the stop's number, and the quest's name. A stop's card word, if it has one, is printed large; when the quest has any, every card but the last says to save it. Ten 3.5 × 2 inch cards to a US Letter sheet, laid out for perforated business-card sheets (Avery 8371 and compatibles).",
    tags: ["Quests"],
    access: "admin",
    request: { params: questParams },
    responses: {
      200: {
        description: "The cards.",
        body: z.string().meta({ format: "binary" }),
        mediaType: "application/pdf",
      },
    },
    problems: [Problems.notFound],
    async handle(req, res) {
      const found = await QuestService.getQuestEntries(req.params.questName);
      if (found.status === "error") {
        sendServiceProblem(res, found);
        return;
      }
      // Every entry plays the same stops, with the same codes.
      const [quest] = found.data;
      const pdf = new PDFDocument({ autoFirstPage: false });
      const chunks: Buffer[] = [];
      pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
      const ended = new Promise((resolve) => pdf.on("end", resolve));
      drawQrCards(
        pdf,
        quest.puzzles.map((puzzle, index) => ({
          questName: quest.displayName,
          stopNumber: index + 1,
          activationCode: puzzle.activationCode,
          ...(puzzle.cardWord ? { cardWord: puzzle.cardWord } : {}),
        }))
      );
      pdf.end();
      await ended;
      res
        .type("application/pdf")
        .attachment(`${req.params.questName}-qr-cards.pdf`)
        .send(Buffer.concat(chunks));
    },
  }),
  defineRoute({
    method: "get",
    path: "/quests/{questName}/events",
    operationId: "listQuestEvents",
    summary: "List what happened in a quest",
    description:
      "The quest's event log, oldest first, for every entry: each event says whose entry it happened in. It keeps names as they were at the time, and survives resetting the quest.",
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
        req.params.questName,
        req.query
      );
      if (page.status === "error") {
        sendServiceProblem(res, page);
        return;
      }
      res.json({
        items: page.data.items.map(toQuestEventResource),
        next: page.data.next,
      });
    },
  }),
];
