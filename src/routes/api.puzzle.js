import express from "express";
import * as PuzzleController from "../controllers/puzzle.controller.js";

const puzzleApiRouter = express.Router();
puzzleApiRouter.post("/activate", PuzzleController.receiveImageData);

export { puzzleApiRouter as PuzzleApiRouter };
