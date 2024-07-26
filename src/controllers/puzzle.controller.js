import { RenderMode } from "../middleware/useRenderMode.js";
import * as PuzzleService from "../services/puzzle.service.js";
import * as UserService from "../services/user.service.js";

export async function createPuzzle(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to create puzzles`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to view puzzles`,
      })
    );
    return;
  }

  if (!req.body) {
    res.status(400).send(JSON.stringify({
      status: "error",
      message: "No request body"
    }));
    return;
  }
  if (!("name" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({
        status: "error",
        message: "No puzzle name in request body"
      }));
    return;
  }
  if (!("solutionKeyword" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({
        status: "error",
        message: "No solution keyword in request body"
      }));
    return;
  }
  if (!("solutionDisplayText" in req.body)) {
    res
      .status(400)
      .send(
        JSON.stringify({
          status: "error",
          message: "No solution display text in request body"
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
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to retrieve puzzles`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to view puzzles`,
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
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to update puzzles`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to update puzzles`,
      })
    );
    return;
  }

  if (!req.body) {
    res.status(400).send(JSON.stringify({
      status: "error",
      message: "No request body"
    }));
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
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to delete puzzles`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to delete puzzles`,
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
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to list puzzles`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to list puzzles`,
      })
    );
    return;
  }
  const response = await PuzzleService.listPuzzles();
  res.send(JSON.stringify(response));
}

export function uploadBinaryData(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to upload binary data`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to upload binary data`,
      })
    );
    return;
  }
  if (!req.body) {
    res.status(400).send(JSON.stringify({
      status: "error",
      message: "No request body"
    }));
    return;
  }
  if (!req.file) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: `Request does not contain binary data`,
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
