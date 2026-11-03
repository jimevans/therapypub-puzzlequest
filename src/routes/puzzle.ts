import express from "express";
import { requireAdmin } from "../middleware/authorization.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import * as UseRenderMode from "../middleware/useRenderMode.js";
import * as PuzzleController from "../controllers/puzzle.controller.js";

const puzzleRouter = express.Router();

puzzleRouter.get(
  "/new",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.CREATE),
  PuzzleController.renderPuzzle
);

puzzleRouter.get(
  "/:name",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.DISPLAY),
  PuzzleController.renderPuzzle
);

puzzleRouter.get(
  "/:name/edit",
  TokenAuthenticator.tokenAuthenticate,
  requireAdmin,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.EDIT),
  PuzzleController.renderPuzzle
);

export { puzzleRouter as PuzzleRouter };
