import type { Response } from "express";
import type { RouteRequest } from "../types.js";
import { RenderMode } from "../middleware/useRenderMode.js";
import * as PuzzleService from "../services/puzzle.service.js";

// The puzzle pages. Their scripts change puzzles through the v1 API.

export async function renderPuzzle(
  req: RouteRequest<"name">,
  res: Response
): Promise<void> {
  const viewName =
    req.renderMode === RenderMode.DISPLAY ? "puzzleDetails" : "puzzleEdit";
  if (req.renderMode === RenderMode.CREATE) {
    res.render(viewName, { renderMode: req.renderMode, puzzle: null });
    return;
  }

  const puzzleResponse = await PuzzleService.getPuzzleByPuzzleName(
    req.params.name
  );
  if (puzzleResponse.status === "error") {
    res.status(puzzleResponse.statusCode).render("error", {
      errorTitle: "Not found",
      errorDetails: puzzleResponse.message,
    });
    return;
  }

  res.render(viewName, {
    renderMode: req.renderMode,
    puzzle: puzzleResponse.data,
  });
}
