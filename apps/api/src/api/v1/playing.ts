// Playing a quest: seeing its puzzles, activating them, guessing their
// solutions, and revealing hints. Only the quest's players may, as themselves
// or as a member of a team playing it; each acts on their own entry.
import { z } from "zod";
import {
  activationRateLimiter,
  solutionRateLimiter,
} from "../../middleware/rateLimiter.js";
import { readQRCode } from "../../middleware/qrCodeReader.js";
import { QuestPuzzleStatus } from "../../models/quest.model.js";
import {
  MAXIMUM_ACTIVATION_IMAGE_BYTES,
  uploadActivationImage,
} from "../../middleware/upload.js";
import {
  activatePuzzleBody,
  requestHintBody,
  solvePuzzleBody,
} from "../../schemas/quest.schemas.js";
import * as QuestService from "../../services/quest.service.js";
import * as UserService from "../../services/user.service.js";
import { Problems, sendProblem, sendServiceProblem } from "../problems.js";
import { playerPuzzleSchema, toPlayerPuzzleResource } from "./resources.js";
import { defineRoute } from "./route.js";

/** The path parameters naming a quest and one of its puzzles. */
const questPuzzleParams = z.object({
  name: z.string().meta({ description: "The quest's name." }),
  puzzleName: z.string().meta({ description: "The puzzle's name." }),
});

/** A scanned camera frame of a puzzle's QR code, as multipart form data. */
const scannedActivation = z.object({
  width: z
    .number()
    .int()
    .meta({ description: "The frame's width, in pixels." }),
  height: z
    .number()
    .int()
    .meta({ description: "The frame's height, in pixels." }),
  image: z.file().meta({
    description: `The frame's raw RGBA pixels, four bytes each, at most ${MAXIMUM_ACTIVATION_IMAGE_BYTES / 1024 / 1024} MB.`,
  }),
});

/** The problems any action of a quest's players can report. */
const playingProblems = [
  Problems.notFound,
  Problems.forbidden,
  Problems.wrongState,
  Problems.questPaused,
  Problems.tryAgain,
];

export const playingRoutes = [
  defineRoute({
    method: "get",
    path: "/quests/{name}/puzzles/{puzzleName}",
    operationId: "getPlayerPuzzle",
    summary: "See a puzzle as its players do",
    description:
      "For a puzzle the caller's entry has reached: what it asks, once activated, the hints revealed, what the next hint would cost, and the solution, once solved. A puzzle not yet reached is not found, even by an administrator, who can see the whole quest with getQuest; an administrator who doesn't play the quest sees its first entry. Players never learn how many puzzles a quest has.",
    tags: ["Playing"],
    access: "signedIn",
    request: { params: questPuzzleParams },
    responses: {
      200: { description: "The puzzle.", body: playerPuzzleSchema },
    },
    problems: [Problems.notFound, Problems.wrongState],
    async handle(req, res) {
      const { name, puzzleName } = req.params;
      const found = await QuestService.getQuestAndPuzzle(
        name,
        puzzleName,
        UserService.requireLoggedInUser(req.user)
      );
      if (found.status === "error") {
        sendServiceProblem(res, found);
        return;
      }
      const { quest, puzzle } = found.data;
      const detail = puzzle.puzzleDetail;
      // Answers as the service does for a puzzle it can't find, so a name
      // can't be tried to learn whether it's in the quest.
      if (!detail || puzzle.status === QuestPuzzleStatus.UNAVAILABLE) {
        sendProblem(
          res,
          Problems.notFound,
          `No puzzle named ${puzzleName} found for quest ${name}`
        );
        return;
      }
      res.json(toPlayerPuzzleResource(quest, puzzle, detail));
    },
  }),
  defineRoute({
    method: "post",
    path: "/quests/{name}/puzzles/{puzzleName}/activation",
    operationId: "activatePuzzle",
    summary: "Activate a puzzle",
    description:
      "Starts the puzzle the players have found, with its activation code: typed, as JSON, or scanned, as a multipart camera frame of its QR code. Failed attempts are limited for each player.",
    tags: ["Playing"],
    access: "signedIn",
    // Checked after authorization, so a refused request's image isn't read.
    before: [activationRateLimiter, uploadActivationImage],
    request: {
      params: questPuzzleParams,
      body: activatePuzzleBody,
      multipart: scannedActivation,
    },
    responses: {
      200: {
        description: "Activated.",
        body: z
          .object({
            activationTime: z.iso.datetime(),
          })
          .meta({ id: "Activation" }),
      },
    },
    problems: [
      ...playingProblems,
      Problems.wrongActivationCode,
      Problems.unreadableQrCode,
      Problems.uploadTooLarge,
      Problems.tooManyRequests,
    ],
    async handle(req, res) {
      const { width, height } = req.body;
      let activationCode = req.body.activationCode;
      if (req.file) {
        activationCode =
          width && height
            ? readQRCode(req.file.buffer, width, height)
            : undefined;
        if (!activationCode) {
          sendProblem(
            res,
            Problems.unreadableQrCode,
            "No QR code could be read from the image"
          );
          return;
        }
      }
      if (!activationCode) {
        sendProblem(
          res,
          Problems.invalidRequest,
          "Send an activation code, or a scanned image of its QR code",
          {
            errors: [{ path: "body.activationCode", message: "Required" }],
          }
        );
        return;
      }
      const user = UserService.requireLoggedInUser(req.user);
      const activated = await QuestService.activatePuzzle(
        req.params.name,
        req.params.puzzleName,
        await user.getAssigneeIds(),
        activationCode,
        { actor: user.userName }
      );
      if (activated.status === "error") {
        sendServiceProblem(res, activated);
        return;
      }
      res.json({ activationTime: activated.data.activationTime });
    },
  }),
  defineRoute({
    method: "post",
    path: "/quests/{name}/puzzles/{puzzleName}/solution-attempts",
    operationId: "attemptSolution",
    summary: "Guess a puzzle's solution",
    description:
      "A guess is right if it contains each of the solution's keywords; letter case, spacing, and punctuation don't matter. Wrong guesses are limited for each player.",
    tags: ["Playing"],
    access: "signedIn",
    before: [solutionRateLimiter],
    request: { params: questPuzzleParams, body: solvePuzzleBody },
    responses: {
      200: {
        description: "The guess is right; the puzzle is solved.",
        body: z
          .object({
            solutionText: z.string(),
            nextPuzzle: z
              .object({ name: z.string(), displayName: z.string() })
              .nullable()
              .meta({
                description:
                  "The puzzle now waiting to be found and activated; null after the last.",
              }),
            questComplete: z.boolean(),
          })
          .meta({ id: "Solution" }),
      },
    },
    problems: [
      ...playingProblems,
      Problems.wrongAnswer,
      Problems.tooManyRequests,
    ],
    async handle(req, res) {
      const user = UserService.requireLoggedInUser(req.user);
      const solved = await QuestService.finishPuzzle(
        req.params.name,
        req.params.puzzleName,
        await user.getAssigneeIds(),
        req.body.guess,
        { actor: user.userName, connectionId: req.body.connectionId }
      );
      if (solved.status === "error") {
        sendServiceProblem(res, solved);
        return;
      }
      const solution = solved.data;
      res.json({
        solutionText: solution.solutionText,
        nextPuzzle: solution.nextPuzzleName
          ? {
              name: solution.nextPuzzleName,
              displayName:
                solution.nextPuzzleDisplayName ?? solution.nextPuzzleName,
            }
          : null,
        questComplete: solution.questComplete ?? false,
      });
    },
  }),
  defineRoute({
    method: "post",
    path: "/quests/{name}/puzzles/{puzzleName}/hints",
    operationId: "revealHint",
    summary: "Reveal a puzzle's next hint",
    description:
      "Each hint adds its time penalty to the players' score. The answer says whether the next hint gives the solution away, so a page can warn first.",
    tags: ["Playing"],
    access: "signedIn",
    request: { params: questPuzzleParams, body: requestHintBody },
    responses: {
      200: {
        description: "The hint revealed.",
        body: z
          .object({
            text: z.string(),
            timePenalty: z
              .number()
              .int()
              .meta({ description: "Seconds added to the players' score." }),
            moreHints: z.boolean(),
            isNextHintSolution: z.boolean(),
          })
          .meta({ id: "Hint" }),
      },
    },
    problems: [...playingProblems, Problems.noMoreHints],
    async handle(req, res) {
      const user = UserService.requireLoggedInUser(req.user);
      const revealed = await QuestService.getPuzzleHint(
        req.params.name,
        req.params.puzzleName,
        await user.getAssigneeIds(),
        { actor: user.userName, connectionId: req.body.connectionId }
      );
      if (revealed.status === "error") {
        sendServiceProblem(res, revealed);
        return;
      }
      if (!revealed.data) {
        sendProblem(
          res,
          Problems.noMoreHints,
          `Every hint for puzzle ${req.params.puzzleName} has been revealed`
        );
        return;
      }
      const { hintText, timePenalty, moreHints, isNextHintSolution } =
        revealed.data;
      res.json({ text: hintText, timePenalty, moreHints, isNextHintSolution });
    },
  }),
];
