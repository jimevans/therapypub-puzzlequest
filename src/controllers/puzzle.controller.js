import { RenderMode } from "../middleware/useRenderMode.js";
import * as PuzzleService from "../services/puzzle.service.js";
import * as UserService from "../services/user.service.js";
import * as RequestValidationService from "../services/requestValidation.service.js";

export async function createPuzzle(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true,
      requiresBody: true,
      requiredBodyProperties: ["name", "solutionKeyword", "solutionDisplayText"],
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }

  const response = await PuzzleService.createPuzzle(req.body);
  if (response.status === "error") {
    res.status(response.statusCode).send(JSON.stringify({
      status: "error",
      message: response.message
    }));
    return;
  }
  res.send(JSON.stringify(response));
}

export async function retrievePuzzle(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }

  const puzzleResponse = await PuzzleService.getPuzzleByPuzzleName(
    req.params.name
  );
  if (puzzleResponse.status === "error") {
    res.status(puzzleResponse.statusCode).send(JSON.stringify({
      status: "error",
      message: puzzleResponse.message
    }));
    return;
  }

  res.send(JSON.stringify(puzzleResponse));
}

export async function updatePuzzle(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true,
      requiresBody: true,
      requiredBodyProperties: ["name"],
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }

  const response = await PuzzleService.updatePuzzle(req.params.name, req.body);
  if (response.status === "error") {
    res.status(response.statusCode).send(JSON.stringify({
      status: "error",
      message: response.message
    }));
    return;
  }
  res.send(JSON.stringify(response));
}

export async function deletePuzzle(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true,
    },
    req,
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }

  const response = await PuzzleService.deletePuzzle(req.params.name);
  if (response.status === "error") {
    res.status(response.statusCode).send(JSON.stringify({
      status: "error",
      message: response.message
    }));
    return;
  }
  res.send(JSON.stringify(response));
}

export async function listPuzzles(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true,
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }
  const response = await PuzzleService.listPuzzles();
  res.send(JSON.stringify(response));
}

export function uploadBinaryData(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true,
      requiresBody: true,
      requiresFile: true
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }

  res.send(
    JSON.stringify({
      status: "success",
      data: `/puzzleData/${req.file.filename}`,
    })
  );
}

export async function renderPuzzle(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.render("login", { requestingUrl: req.url });
    return;
  }
  if (!loggedInUser.isAdmin()) {
    res.render(
      "error",
      {
        errorTitle: "Unauthorized",
        errorDetails: `User ${loggedInUser.userName} not authorized to view puzzles`
      }
    );
    return;
  }

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
    res.render(
      "error",
      {
        errorTitle: "Not found",
        errorDetails: puzzleResponse.message
      }
    );
    return;
  }

  res.render(viewName, {
    renderMode: req.renderMode,
    puzzle: puzzleResponse.data,
  });
}
