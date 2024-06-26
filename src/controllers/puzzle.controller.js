import { randomUUID } from "crypto";
import jsQR from "jsqr";

import { RenderMode } from "../middleware/useRenderMode.js";
import * as AuthenticationService from "../services/authentication.service.js";
import * as PuzzleService from "../services/puzzle.service.js";

// TODO: Remove this. It's only here for demo/experimentation purposes.
export function activatePuzzle(req, res) {
  res.render("activate");
}

// TODO: Remove this. It's only here for demo/experimentation purposes.
export async function receiveImageData(req, res) {
  const imageBuffer = new Uint8ClampedArray(req.file.buffer);
  const code = jsQR(imageBuffer, req.body.width, req.body.height);
  if (code) {
    console.log(`${code.data}`);
  } else {
    console.log("No QR code found in image");
  }
  res.send(
    JSON.stringify({
      status: "success",
      receivedDataLength: imageBuffer.length,
    })
  );
}

export async function createPuzzle(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        error: `User must be logged in to create puzzles`,
      })
    );
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to view puzzles`,
      })
    );
    return;
  }

  if (!req.body) {
    res.status(400).send(JSON.stringify({ error: "No request body" }));
    return;
  }
  if (!("name" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({ error: "No puzzle name in request body" }));
    return;
  }
  if (!("solutionKeyword" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({ error: "No solution keyword in request body" }));
    return;
  }
  if (!("solutionDisplayText" in req.body)) {
    res
      .status(400)
      .send(
        JSON.stringify({ error: "No solution display text in request body" })
      );
    return;
  }
  if (!("activationCode" in req.body)) {
    req.body.activationCode = randomUUID().replaceAll("-", "");
  }
  const response = await PuzzleService.createPuzzle(req.body);
  if ("error" in response) {
    res.status(400).send(JSON.stringify(response));
    return;
  }
  res.send(JSON.stringify(response));
}

export async function retrievePuzzle(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        error: `User must be logged in to retrieve puzzles`,
      })
    );
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to view puzzles`,
      })
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
  if ("error" in puzzleResponse) {
    res.status(500).send(JSON.stringify(puzzleResponse));
  }

  if (req.renderMode) {
    res.render(viewName, {
      renderMode: req.renderMode,
      puzzle: puzzleResponse.puzzle,
    });
    return;
  }

  res.send(JSON.stringify(puzzleResponse));
}

export async function updatePuzzle(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        error: `User must be logged in to update puzzles`,
      })
    );
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to update puzzles`,
      })
    );
    return;
  }

  if (!req.body) {
    res.status(400).send(JSON.stringify({ error: "No request body" }));
    return;
  }
  const response = await PuzzleService.updatePuzzle(req.params.name, req.body);
  if ("error" in response) {
    res.status(500).send(JSON.stringify(response));
  }
  res.send(JSON.stringify(response));
}

export async function deletePuzzle(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        error: `User must be logged in to delete puzzles`,
      })
    );
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to delete puzzles`,
      })
    );
    return;
  }

  if (!req.body) {
    res.status(400).send(JSON.stringify({ error: "No request body" }));
    return;
  }
  const response = await PuzzleService.deletePuzzle(req.params.name);
  if ("error" in response) {
    res.status(500).send(JSON.stringify(response));
  }
  res.send(JSON.stringify(response));
}

export async function listPuzzles(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        error: `User must be logged in to list puzzles`,
      })
    );
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to list puzzles`,
      })
    );
  }
  const response = await PuzzleService.listPuzzles();
  res.send(JSON.stringify(response));
}

export function uploadBinaryData(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        error: `User must be logged in to upload binary data`,
      })
    );
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        error: `User ${req.user.userName} not authorized to upload binary data`,
      })
    );
    return;
  }
  if (!req.body) {
    res.status(400).send(JSON.stringify({ error: "No request body" }));
    return;
  }
  if (!req.file) {
    res.status(400).send(
      JSON.stringify({
        error: `Request does not contain binary data`,
      })
    );
  }

  res.send(
    JSON.stringify({
      status: "success",
      location: `/puzzleData/${req.file.filename}`,
    })
  );
}
