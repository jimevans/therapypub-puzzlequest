import express from "express";
import { requireAdmin } from "../middleware/authorization.js";
import { authenticateSession } from "../middleware/sessionAuthentication.js";
import * as UseRenderMode from "../middleware/useRenderMode.js";
import * as PuzzleController from "../controllers/puzzle.controller.js";

const puzzleRouter = express.Router();

puzzleRouter.get(
  "/new",
  authenticateSession,
  requireAdmin,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.CREATE),
  PuzzleController.renderPuzzle
);

puzzleRouter.get(
  "/:name",
  authenticateSession,
  requireAdmin,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.DISPLAY),
  PuzzleController.renderPuzzle
);

puzzleRouter.get(
  "/:name/edit",
  authenticateSession,
  requireAdmin,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.EDIT),
  PuzzleController.renderPuzzle
);

export { puzzleRouter as PuzzleRouter };
