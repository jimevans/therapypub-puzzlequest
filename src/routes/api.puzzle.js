import express from "express";
import multer from "multer";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import * as PuzzleController from "../controllers/puzzle.controller.js";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, `${import.meta.dirname}/../public/puzzleData`);
  },
  filename: function (req, file, cb) {
    cb(null, `${req.body.puzzleName}.${req.body.fileExtension}`);
  }
});

const uploadActivate = multer();
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

// TODO: Remove this. It's only here for demo/experimentation purposes.
puzzleApiRouter.post(
  "/activate",
  uploadActivate.single("image"),
  PuzzleController.receiveImageData
);

export { puzzleApiRouter as PuzzleApiRouter };
