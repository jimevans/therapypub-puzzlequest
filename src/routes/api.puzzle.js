import express from "express";
import multer from "multer";
import * as PuzzleController from "../controllers/puzzle.controller.js";

const upload = multer();

const fieldSpecifier = [
  { name: "image", maxCount: 1 },
]

const puzzleApiRouter = express.Router();
puzzleApiRouter.post("/activate", upload.single("image"), PuzzleController.receiveImageData);

export { puzzleApiRouter as PuzzleApiRouter };
