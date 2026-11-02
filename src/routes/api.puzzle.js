import express from "express";
import multer from "multer";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import * as PuzzleController from "../controllers/puzzle.controller.js";
import { puzzleDataDirectory } from "../paths.js";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, puzzleDataDirectory);
  },
  filename: function (req, file, cb) {
    cb(null, `${req.body.puzzleName}.${req.body.fileExtension}`);
  },
});

const upload = multer({ storage: storage });

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
  upload.single("binary"),
  PuzzleController.uploadBinaryData
);

export { puzzleApiRouter as PuzzleApiRouter };
