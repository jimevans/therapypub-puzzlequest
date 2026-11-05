// Puzzles, and the media files image, audio, and video puzzles show. Only
// administrators may use these: puzzles hold their solutions.
import { z } from "zod";
import {
  MAXIMUM_PUZZLE_MEDIA_BYTES,
  PUZZLE_MEDIA_EXTENSIONS,
  uploadPuzzleMedia,
} from "../../middleware/upload.js";
import {
  createPuzzleBody,
  updatePuzzleBody,
} from "../../schemas/puzzle.schemas.js";
import * as PuzzleService from "../../services/puzzle.service.js";
import { pageQuery, pageSchema } from "../paging.js";
import { Problems, sendProblem, sendServiceProblem } from "../problems.js";
import { puzzleSchema, resourcePath, toPuzzleResource } from "./resources.js";
import { defineRoute } from "./route.js";

/** The path parameter naming a puzzle. */
const puzzleParams = z.object({
  name: z.string().meta({ description: "The puzzle's name." }),
});

/** An upload of a puzzle's media file, as multipart form data. */
const puzzleMediaUpload = z.object({
  puzzleName: z.string().meta({
    description: "The puzzle the file is for; the file is named after it.",
  }),
  fileExtension: z.string().meta({
    description: `The file's extension, which says what kind of file it is: one of ${[...PUZZLE_MEDIA_EXTENSIONS].join(", ")}.`,
  }),
  binary: z.file().meta({
    description: `The file, at most ${MAXIMUM_PUZZLE_MEDIA_BYTES / 1024 / 1024} MB; sent after the other fields.`,
  }),
});

/** Where an uploaded media file is. */
const puzzleMediaSchema = z
  .object({
    path: z.string().meta({
      description:
        "The file's path on this site, such as /puzzleData/riddle.png: the text of a puzzle that shows it.",
    }),
  })
  .meta({ id: "PuzzleMedia" });

/**
 * Gets a puzzle as the API shows it.
 * @param name the puzzle's name
 * @returns the puzzle, or the service's error result
 */
async function getPuzzleResource(name: string) {
  const result = await PuzzleService.getPuzzleByPuzzleName(name);
  return result.status === "error"
    ? result
    : { status: "success" as const, data: toPuzzleResource(result.data) };
}

export const puzzleRoutes = [
  defineRoute({
    method: "get",
    path: "/puzzles",
    operationId: "listPuzzles",
    summary: "List puzzles",
    tags: ["Puzzles"],
    access: "admin",
    request: { query: pageQuery },
    responses: {
      200: {
        description: "A page of puzzles.",
        body: pageSchema(puzzleSchema),
      },
    },
    async handle(req, res) {
      const page = await PuzzleService.listPuzzlesPage(req.query);
      res.json({ items: page.items.map(toPuzzleResource), next: page.next });
    },
  }),
  defineRoute({
    method: "post",
    path: "/puzzles",
    operationId: "createPuzzle",
    summary: "Create a puzzle",
    description:
      "For an image, audio, or video puzzle, upload its file first (POST /puzzle-media), and give the file's path as the text.",
    tags: ["Puzzles"],
    access: "admin",
    request: { body: createPuzzleBody },
    responses: {
      201: {
        description: "Created.",
        body: puzzleSchema,
        headers: { Location: { description: "The new puzzle." } },
      },
    },
    problems: [Problems.alreadyExists],
    async handle(req, res) {
      const created = await PuzzleService.createPuzzle(req.body);
      if (created.status === "error") {
        sendServiceProblem(res, created);
        return;
      }
      const puzzle = await getPuzzleResource(req.body.name);
      if (puzzle.status === "error") {
        sendServiceProblem(res, puzzle);
        return;
      }
      res
        .status(201)
        .location(resourcePath("puzzles", req.body.name))
        .json(puzzle.data);
    },
  }),
  defineRoute({
    method: "get",
    path: "/puzzles/{name}",
    operationId: "getPuzzle",
    summary: "Get a puzzle",
    tags: ["Puzzles"],
    access: "admin",
    request: { params: puzzleParams },
    responses: { 200: { description: "The puzzle.", body: puzzleSchema } },
    problems: [Problems.notFound],
    async handle(req, res) {
      const puzzle = await getPuzzleResource(req.params.name);
      if (puzzle.status === "error") {
        sendServiceProblem(res, puzzle);
        return;
      }
      res.json(puzzle.data);
    },
  }),
  defineRoute({
    method: "patch",
    path: "/puzzles/{name}",
    operationId: "updatePuzzle",
    summary: "Change a puzzle",
    description:
      "Changes the fields given. Quests already using the puzzle use the change at once, including a new solution: to correct a puzzle the players have already solved, pause the quest, change the puzzle, and reset it in the quest.",
    tags: ["Puzzles"],
    access: "admin",
    request: { params: puzzleParams, body: updatePuzzleBody },
    responses: { 200: { description: "The puzzle.", body: puzzleSchema } },
    problems: [Problems.notFound],
    async handle(req, res) {
      const updated = await PuzzleService.updatePuzzle(
        req.params.name,
        req.body
      );
      if (updated.status === "error") {
        sendServiceProblem(res, updated);
        return;
      }
      const puzzle = await getPuzzleResource(req.params.name);
      if (puzzle.status === "error") {
        sendServiceProblem(res, puzzle);
        return;
      }
      res.json(puzzle.data);
    },
  }),
  defineRoute({
    method: "delete",
    path: "/puzzles/{name}",
    operationId: "deletePuzzle",
    summary: "Delete a puzzle",
    description:
      "Refused while a quest uses the puzzle; remove it from those quests first.",
    tags: ["Puzzles"],
    access: "admin",
    request: { params: puzzleParams },
    responses: { 204: { description: "Deleted." } },
    problems: [Problems.notFound, Problems.inUse],
    async handle(req, res) {
      const deleted = await PuzzleService.deletePuzzle(req.params.name);
      if (deleted.status === "error") {
        sendServiceProblem(res, deleted);
        return;
      }
      res.status(204).end();
    },
  }),
  defineRoute({
    method: "post",
    path: "/puzzle-media",
    operationId: "uploadPuzzleMedia",
    summary: "Upload a puzzle's media file",
    description:
      "Stores an image, audio, or video file for a puzzle, named after the puzzle, replacing any file of the same name. Give the returned path as the puzzle's text.",
    tags: ["Puzzles"],
    access: "admin",
    // Checked after authorization, so a refused request stores nothing.
    before: [uploadPuzzleMedia],
    request: { multipart: puzzleMediaUpload },
    responses: {
      201: {
        description: "Stored.",
        body: puzzleMediaSchema,
        headers: { Location: { description: "The file." } },
      },
    },
    problems: [Problems.invalidUpload, Problems.uploadTooLarge],
    handle(req, res) {
      if (!req.file) {
        sendProblem(
          res,
          Problems.invalidUpload,
          "The request must include the file, in the binary field"
        );
        return;
      }
      const path = `/puzzleData/${req.file.filename}`;
      res.status(201).location(path).json({ path });
    },
  }),
];
