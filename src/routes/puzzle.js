import express from "express";
import * as PuzzleController from "../controllers/puzzle.controller.js";

const puzzleRouter = express.Router();
puzzleRouter.get("/activate", PuzzleController.activatePuzzle);

export { puzzleRouter as PuzzleRouter };
