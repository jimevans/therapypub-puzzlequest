import express from "express";
import { validate } from "../middleware/validate.js";
import {
  createPuzzleBody,
  updatePuzzleBody,
} from "../schemas/puzzle.schemas.js";
import { requireAdmin } from "../middleware/authorization.js";
import { authenticateSession } from "../middleware/sessionAuthentication.js";
import { uploadPuzzleMedia } from "../middleware/upload.js";
import * as PuzzleController from "../controllers/puzzle.controller.js";

const puzzleApiRouter = express.Router();
puzzleApiRouter.get(
  "/list",
  authenticateSession,
  requireAdmin,
  PuzzleController.listPuzzles
);
puzzleApiRouter.get(
  "/:name",
  authenticateSession,
  requireAdmin,
  PuzzleController.retrievePuzzle
);
puzzleApiRouter.put(
  "/:name",
  authenticateSession,
  requireAdmin,
  validate({ body: updatePuzzleBody }),
  PuzzleController.updatePuzzle
);
puzzleApiRouter.delete(
  "/:name",
  authenticateSession,
  requireAdmin,
  PuzzleController.deletePuzzle
);
puzzleApiRouter.post(
  "/create",
  authenticateSession,
  requireAdmin,
  validate({ body: createPuzzleBody }),
  PuzzleController.createPuzzle
);
puzzleApiRouter.post(
  "/upload",
  authenticateSession,
  // Checked before the upload is stored, so rejected requests write nothing.
  requireAdmin,
  uploadPuzzleMedia,
  PuzzleController.uploadBinaryData
);

export { puzzleApiRouter as PuzzleApiRouter };
