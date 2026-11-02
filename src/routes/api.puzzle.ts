import express from "express";
import { requireAdmin } from "../middleware/authorization.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import { uploadPuzzleMedia } from "../middleware/upload.js";
import * as PuzzleController from "../controllers/puzzle.controller.js";

const puzzleApiRouter = express.Router();
puzzleApiRouter.get(
  "/list",
  TokenAuthenticator.tokenAuthenticate,
  PuzzleController.listPuzzles
);
puzzleApiRouter.get(
  "/:name",
  TokenAuthenticator.tokenAuthenticate,
  PuzzleController.retrievePuzzle
);
puzzleApiRouter.put(
  "/:name",
  TokenAuthenticator.tokenAuthenticate,
  PuzzleController.updatePuzzle
);
puzzleApiRouter.delete(
  "/:name",
  TokenAuthenticator.tokenAuthenticate,
  PuzzleController.deletePuzzle
);
puzzleApiRouter.post(
  "/create",
  TokenAuthenticator.tokenAuthenticate,
  PuzzleController.createPuzzle
);
puzzleApiRouter.post(
  "/upload",
  TokenAuthenticator.tokenAuthenticate,
  // Checked before the upload is stored, so rejected requests write nothing.
  requireAdmin,
  uploadPuzzleMedia,
  PuzzleController.uploadBinaryData
);

export { puzzleApiRouter as PuzzleApiRouter };
