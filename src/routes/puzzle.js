import express from "express";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import * as UseRenderMode from "../middleware/useRenderMode.js";
import * as PuzzleController from "../controllers/puzzle.controller.js";

const puzzleRouter = express.Router();

puzzleRouter.get(
  "/new",
  TokenAuthenticator.tokenAuthenticate,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.CREATE),
  PuzzleController.renderPuzzle
);

puzzleRouter.get(
  "/:name",
  TokenAuthenticator.tokenAuthenticate,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.DISPLAY),
  PuzzleController.renderPuzzle
);

puzzleRouter.get(
  "/:name/edit",
  TokenAuthenticator.tokenAuthenticate,
  UseRenderMode.useRenderMode(UseRenderMode.RenderMode.EDIT),
  PuzzleController.renderPuzzle
)


export { puzzleRouter as PuzzleRouter };
