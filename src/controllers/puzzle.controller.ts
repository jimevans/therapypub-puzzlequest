import type { Request, Response } from "express";
import type { BodyRequest, RouteRequest } from "../types.js";
import type {
  CreatePuzzleBody,
  UpdatePuzzleBody,
} from "../schemas/puzzle.schemas.js";
import { RenderMode } from "../middleware/useRenderMode.js";
import * as PuzzleService from "../services/puzzle.service.js";

export async function createPuzzle(
  req: BodyRequest<CreatePuzzleBody>,
  res: Response
): Promise<void> {
  const response = await PuzzleService.createPuzzle(req.body);
  if (response.status === "error") {
    res.status(response.statusCode).send(
      JSON.stringify({
        status: "error",
        message: response.message,
      })
    );
    return;
  }
  res.send(JSON.stringify(response));
}

export async function retrievePuzzle(
  req: RouteRequest<"name">,
  res: Response
): Promise<void> {
  const puzzleResponse = await PuzzleService.getPuzzleByPuzzleName(
    req.params.name
  );
  if (puzzleResponse.status === "error") {
    res.status(puzzleResponse.statusCode).send(
      JSON.stringify({
        status: "error",
        message: puzzleResponse.message,
      })
    );
    return;
  }

  res.send(JSON.stringify(puzzleResponse));
}

export async function updatePuzzle(
  req: RouteRequest<"name", UpdatePuzzleBody>,
  res: Response
): Promise<void> {
  const response = await PuzzleService.updatePuzzle(req.params.name, req.body);
  if (response.status === "error") {
    res.status(response.statusCode).send(
      JSON.stringify({
        status: "error",
        message: response.message,
      })
    );
    return;
  }
  res.send(JSON.stringify(response));
}

export async function deletePuzzle(
  req: RouteRequest<"name">,
  res: Response
): Promise<void> {
  const response = await PuzzleService.deletePuzzle(req.params.name);
  if (response.status === "error") {
    res.status(response.statusCode).send(
      JSON.stringify({
        status: "error",
        message: response.message,
      })
    );
    return;
  }
  res.send(JSON.stringify(response));
}

export async function listPuzzles(req: Request, res: Response): Promise<void> {
  const response = await PuzzleService.listPuzzles();
  res.send(JSON.stringify(response));
}

export function uploadBinaryData(req: Request, res: Response): void {
  if (!req.file) {
    res
      .status(400)
      .json({ status: "error", message: "Request must have an uploaded file" });
    return;
  }
  res.send(
    JSON.stringify({
      status: "success",
      data: `/puzzleData/${req.file.filename}`,
    })
  );
}

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
