import path from "path";
import { fileURLToPath } from "url";
import { PassThrough } from "stream";
import { marked } from "marked";
import { RenderMode } from "../middleware/useRenderMode.js";
import { PuzzleType } from "../models/puzzle.model.js";
import { QuestPuzzleStatus } from "../models/quest.model.js";
import PDFDocument from "pdfkit";
import * as AuthenticationService from "../services/authentication.service.js";
import * as QuestService from "../services/quest.service.js";

async function getQuestForUser(questName, userName, isUserAdmin) {
  if (isUserAdmin) {
    const adminQuestResponse = await QuestService.getQuest(questName);
    if (adminQuestResponse.status === "error") {
      return adminQuestResponse;
    }
    return {
      status: "success",
      statusCode: 200,
      data: adminQuestResponse.data,
    };
  }
  const isAuthorizedUserResponse = await QuestService.isQuestForUser(
    questName,
    userName
  );
  if (isAuthorizedUserResponse.status === "error") {
    return isAuthorizedUserResponse;
  }
  const isQuestForUser = isAuthorizedUserResponse.data.isQuestForUser;
  if (!isQuestForUser && !isUserAdmin) {
    if (!isUserAdmin) {
      return {
        status: "error",
        statusCode: 403,
        message: `User ${req.user.userName} not authorized to view quests`,
      };
    }

    if (!isQuestForUser) {
      return {
        status: "error",
        statusCode: 403,
        message: `User ${req.user.userName} not authorized for quest ${isAuthorizedUserResponse.data.quest.name}`,
      };
    }
  }
  return {
    status: "success",
    statusCode: 200,
    data: isAuthorizedUserResponse.data.quest,
  };
}

async function getQuestPuzzle(user, questName, puzzleName) {
  if (user === null) {
    return {
      status: "error",
      statusCode: 401,
      message: `User must be logged in to retrieve quests`,
    };
  }

  const isUserAdmin = AuthenticationService.isUserAdmin(user);
  const questResponse = await getQuestForUser(
    questName,
    user.userName,
    isUserAdmin
  );

  if (questResponse.status === "error") {
    return questResponse;
  }

  const quest = questResponse.data;
  const filteredPuzzles = quest.puzzles.filter(
    (puzzle) =>
      puzzle.name === puzzleName &&
      puzzle.status > QuestPuzzleStatus.UNAVAILABLE
  );

  if (filteredPuzzles.length === 0) {
    return {
      status: "error",
      statusCode: 404,
      message: `Invalid puzzle name for ${questName}`,
    };
  }

  const puzzle = filteredPuzzles[0];
  return { status: "success", data: puzzle };
}

export async function createQuest(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to create quests`,
      })
    );
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${req.user.userName} not authorized to create quests`,
      })
    );
    return;
  }

  if (!req.body) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: "No request body",
      })
    );
    return;
  }
  if (!("name" in req.body) && !("displayName" in req.body)) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: "No quest name in request body",
      })
    );
    return;
  }
  if (!("userName" in req.body)) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: "No assigned user name in request body",
      })
    );
    return;
  }
  const response = await QuestService.createQuest(req.body);
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

export async function retrieveQuest(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to retrieve quests`,
      })
    );
    return;
  }

  const isUserAdmin = AuthenticationService.isUserAdmin(req.user);
  const questResponse = await getQuestForUser(
    req.params.name,
    req.user.userName,
    isUserAdmin
  );

  if (questResponse.status === "error") {
    res.status(questResponse.statusCode).send({
      status: "error",
      message: questResponse.message,
    });
    return;
  }
  res.send(JSON.stringify(questResponse));
}

export async function updateQuest(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to update quest`,
      })
    );
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${req.user.userName} not authorized to update quest`,
      })
    );
    return;
  }

  if (!req.body) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: "No request body",
      })
    );
    return;
  }
  const response = await QuestService.updateQuest(req.params.name, req.body);
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

export async function deleteQuest(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to delete quests`,
      })
    );
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${req.user.userName} not authorized to delete quests`,
      })
    );
    return;
  }

  if (!req.body) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: "No request body",
      })
    );
    return;
  }
  const response = await QuestService.deleteQuest(req.params.name);
  if (response.status === "error") {
    res.status(response.statusCode).send(
      JSON.stringify({
        status: "error",
        message: response.message,
      })
    );
  }
  res.send(JSON.stringify(response));
}

export async function listQuests(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to list quests`,
      })
    );
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${req.user.userName} not authorized to list quests`,
      })
    );
    return;
  }
  const response = await QuestService.getQuests();
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

export async function activateQuest(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to activate quests`,
      })
    );
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${req.user.userName} not authorized to activate quests`,
      })
    );
    return;
  }

  const startQuestResponse = await QuestService.startQuest(req.params.name);
  if (startQuestResponse.status === "error") {
    res.status(startQuestResponse.statusCode).send(
      JSON.stringify({
        status: "error",
        message: startQuestResponse.message,
      })
    );
    return;
  }
  res.send(JSON.stringify(startQuestResponse));
}

export async function resetQuest(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to reset quests`,
      })
    );
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${req.user.userName} not authorized to reset quests`,
      })
    );
    return;
  }

  const resetQuestResponse = await QuestService.resetQuest(req.params.name);
  if (resetQuestResponse.status === "error") {
    res.status(resetQuestResponse.statusCode).send(
      JSON.stringify({
        status: "error",
        message: resetQuestResponse.message,
      })
    );
    return;
  }
  res.send(JSON.stringify(resetQuestResponse));
}

export async function generatePuzzleActivationQRCode(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to generate puzzle activation QR codes`,
      })
    );
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${req.user.userName} not authorized to generate puzzle activation QR codes`,
      })
    );
    return;
  }
  const qrCodeResponse = await QuestService.getPuzzleActivationQrCode(
    req.params.name,
    req.params.puzzleName
  );
  if (qrCodeResponse.status === "error") {
    res.status(qrCodeResponse.statusCode).send(
      JSON.stringify({
        status: "error",
        message: qrCodeResponse.message,
      })
    );
    return;
  }
  res.send({ status: "success", data: qrCodeResponse.data });
}

export async function activateQuestPuzzle(req, res) {
  if (!(req.qrCodeData || req.body?.activationCode)) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: "No activation code sent in request",
      })
    );
    return;
  }

  const activationCode = req.qrCodeData
    ? req.qrCodeData
    : req.body.activationCode;
  const puzzleResponse = await getQuestPuzzle(
    req.user,
    req.params.name,
    req.params.puzzleName
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

  const puzzle = puzzleResponse.data;
  if (puzzle.status !== QuestPuzzleStatus.AWAITING_ACTIVATION) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: `Puzzle ${req.params.puzzleName} is already activated`,
      })
    );
    return;
  }

  const activationResult = await QuestService.activatePuzzle(
    req.params.name,
    req.params.puzzleName,
    activationCode
  );
  if (activationResult.status === "error") {
    res.status(activationResult.statusCode).send(
      JSON.stringify({
        status: "error",
        message: activationResult.message,
      })
    );
    return;
  }
  res.send(JSON.stringify({ status: "success" }));
}

export async function solveQuestPuzzle(req, res) {
  if (!req.body?.guess) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: "No solution guess sent in request",
      })
    );
    return;
  }

  const solutionGuess = req.body.guess;
  const puzzleResponse = await getQuestPuzzle(
    req.user,
    req.params.name,
    req.params.puzzleName
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

  const puzzle = puzzleResponse.data;
  if (puzzle.status < QuestPuzzleStatus.IN_PROGRESS) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: `Puzzle ${puzzleName} is not yet activated`,
      })
    );
    return;
  } else if (puzzle.status > QuestPuzzleStatus.IN_PROGRESS) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: `Puzzle ${puzzleName} is already solved`,
      })
    );
    return;
  }

  const solutionResult = await QuestService.finishPuzzle(
    req.params.name,
    req.params.puzzleName,
    solutionGuess
  );
  if (solutionResult.status === "error") {
    res.status(solutionResult.statusCode).send(
      JSON.stringify({
        status: "error",
        message: solutionResult.message,
      })
    );
    return;
  }
  res.send(JSON.stringify({ status: "success", data: solutionResult.data }));
}

export async function requestQuestPuzzleHint(req, res) {
  const puzzleResponse = await getQuestPuzzle(
    req.user,
    req.params.name,
    req.params.puzzleName
  );
  if (puzzleResponse.status === "error") {
    res.status(puzzleResponse.statusCode).send(
      JSON.stringify({
        status: "error",
        message: puzzleResponse.error,
      })
    );
    return;
  }

  const puzzle = puzzleResponse.data;
  if (puzzle.status < QuestPuzzleStatus.IN_PROGRESS) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: `Puzzle ${puzzleName} is not yet activated`,
      })
    );
    return;
  } else if (puzzle.status > QuestPuzzleStatus.IN_PROGRESS) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: `Puzzle ${puzzleName} is already solved`,
      })
    );
    return;
  }

  const hintResult = await QuestService.getPuzzleHint(
    req.params.name,
    req.params.puzzleName
  );
  if (hintResult.status === "error") {
    res.status(hintResult.statusCode).send(
      JSON.stringify({
        status: "error",
        message: hintResponse.message,
      })
    );
    return;
  }

  res.send(JSON.stringify(hintResult));
}

export async function renderQuest(req, res) {
  if (req.user === null) {
    res.render("login", { requestingUrl: req.url });
    return;
  }

  const isUserAdmin = AuthenticationService.isUserAdmin(req.user);
  const viewName = isUserAdmin
    ? req.renderMode === RenderMode.DISPLAY
      ? "questDetails"
      : "questEdit"
    : "quest";

  if (req.renderMode === RenderMode.CREATE) {
    if (!isUserAdmin) {
      res.render(
        "error",
        {
          errorTitle: "Unauthorized",
          errorDetails: `User ${req.user.userName} not authorized to create new quests`
        }
      );
      return;
    }
    res.render(viewName, { renderMode: req.renderMode, quest: null });
    return;
  }

  const questResponse = await getQuestForUser(
    req.params.name,
    req.user.userName,
    isUserAdmin
  );

  if (questResponse.status === "error") {
    res.render("error", { errorTitle: "Unauthorized", errorDetails: questResponse.message });
    return;
  }

  const inProgressStartTimes = questResponse.data.puzzles
    .filter(puzzle => puzzle.status > 0 && puzzle.status < 3)
    .map(puzzle => puzzle.startTime);
  const currentPuzzleStartTime = inProgressStartTimes.length ? inProgressStartTimes[0] : undefined;
  res.render(viewName, {
    userName: req.user.userName,
    renderMode: req.renderMode,
    quest: questResponse.data,
    currentPuzzleStartTime
  });
}

export async function renderQuestPuzzle(req, res) {
  const puzzleResponse = await getQuestPuzzle(
    req.user,
    req.params.name,
    req.params.puzzleName
  );
  if (puzzleResponse.status === "error") {
    if (puzzleResponse.statusCode === 401) {
      res.render("login", { requestingUrl: req.url });
    } else if (puzzleResponse.statusCode === 403) {
      res.render("error", { errorTitle: "Unauthorized", errorDetails: puzzleResponse.message });
    } else if (puzzleResponse.statusCode === 404) {
      res.render("error", { errorTitle: "Not found", errorDetails: puzzleResponse.message });
    } else {
      res.render("error", { errorTitle: "Unexpected error", errorDetails: puzzleResponse.message });
    }
    return;
  }

  const puzzle = puzzleResponse.data;
  if (puzzle.status === QuestPuzzleStatus.AWAITING_ACTIVATION) {
    res.render("activate", {
      userName: req.user.userName,
      quest: req.params.name,
      puzzle: puzzleResponse.data,
    });
    return;
  }
  if (puzzle.status < QuestPuzzleStatus.AWAITING_ACTIVATION) {
    res.render(
      "error",
      {
        errorTitle: "Not found",
        errorDetails: `Puzzle ${puzzleName} is not part of quest ${req.params.name}`
      }
    );
    return;
  }

  let renderedPuzzle;
  switch (puzzle.type) {
    case PuzzleType.IMAGE:
      renderedPuzzle = `<img src="${puzzle.text}" class="pq-puzzle-img" />`;
      break;
    case PuzzleType.AUDIO:
      renderedPuzzle = `<audio src="${puzzle.text}" />`;
      break;
    case PuzzleType.VIDEO:
      renderedPuzzle = `<video src="${puzzle.text}" />`;
      break;
    default:
      renderedPuzzle = await marked.parse(puzzle.text, { gfm: true });
  }

  res.render("puzzle", {
    userName: req.user.userName,
    quest: req.params.name,
    puzzle: puzzleResponse.data,
    rendered: renderedPuzzle,
  });
}

export async function renderPuzzleActivationQRCode(req, res) {
  if (req.user === null) {
    res.render("login", { requestingUrl: req.url.replace(/\/qrcode$/i, "") });
    return;
  }
  if (!AuthenticationService.isUserAdmin(req.user)) {
    res.render(
      "error",
      {
        errorTitle: "Forbidden",
        errorDetails: `User ${req.user.userName} not authorized to generate puzzle activation QR codes`
      }
    );
    return;
  }
  const qrCodeResponse = await QuestService.getPuzzleActivationQrCode(
    req.params.name,
    req.params.puzzleName
  );
  if (qrCodeResponse.status === "error") {
    const errorTitle = qrCodeResponse.statusCode === 404 ? "Not found" : "Unexpected error";
    const errorDetails = qrCodeResponse.message;
    res.render("error", { errorTitle, errorDetails });
    return;
  }
  const qrStream = new PassThrough();
  qrStream.end(qrCodeResponse.data);
  res.set(
    "Content-Disposition",
    `attachment; filename=puzzlequest-${req.params.name}-${req.params.puzzleName}-activation`
  );
  res.set("Content-Type", "image/png");
  qrStream.pipe(res);
}

export async function renderQuestRunBook(req, res) {
  if (req.user === null) {
    res.render("login", { requestingUrl: req.url.replace(/\/pdf$/i, "") });
    return;
  }

  const isUserAdmin = AuthenticationService.isUserAdmin(req.user);
  if (isUserAdmin) {
    res.render(
      "error",
      {
        errorTitle: "Unauthorized",
        errorDetails: `User ${req.user.userName} not authorized to generate puzzle activation QR codes`
      }
    );
    return;
  }
  const questResponse = await getQuestForUser(
    req.params.name,
    req.user.userName,
    isUserAdmin
  );
  if (questResponse.status === "error") {
    res.render("error", { errorTitle: "Unauthorized", errorDetails: questResponse.message });
    return;
  }

  const quest = questResponse.data;
  const buffers = [];
  const pdfDoc = new PDFDocument({ autoFirstPage: false, bufferPages: true, });
  pdfDoc.on("data", buffers.push.bind(buffers));
  pdfDoc.on("end", () => {
    const pdfBuffer = Buffer.concat(buffers);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${quest.name}.pdf`,
      "Content-Length": Buffer.byteLength(pdfBuffer)
    }).end(pdfBuffer);
  });

  quest.puzzles.forEach((puzzle) => {
    pdfDoc.addPage({ margins: { top: 72, left: 72, right: 72, bottom: 36 } });
    pdfDoc.fontSize(18);
    pdfDoc.text(puzzle.displayName, { align: "center" });
    pdfDoc.fontSize(10);
    pdfDoc.moveDown();
    if (puzzle.type === 0) {
      new marked.Lexer({ gfm: true })
        .lex(puzzle.text)
        .forEach((token) => processMarkdownToken(token, pdfDoc));
      pdfDoc.text("");
    } else if (puzzle.type === 1) {
      const dirname = path.dirname(fileURLToPath(import.meta.url));
      const image = path.join(dirname, "..", "public", puzzle.text);
      pdfDoc.image(image, { fit: [72 * 6.5, 72 * 8.5], align: 'center', valign: 'center' });
    } else {
      pdfDoc.text("Puzzle content is audio or video and cannot be rendered on paper.");
    }
  });
  pdfDoc.end();
}

function processMarkdownToken(token, pdfDoc) {
  if (token.type === "paragraph" || token.type === "space") {
    pdfDoc.text("");
    pdfDoc.moveDown();
  }
  if (token.type === "codespan") {
    pdfDoc.font("Courier").text(token.text, { continued: true }).font("Helvetica");
  }
  if (token.type === "code") {
    pdfDoc.font("Courier").text(token.text, { align: "center" }).font("Helvetica").fontSize(10);
  }
  if (token.type === "text" || token.type === "escape") {
    const text = token.text.replace(/&#x([\dA-Fa-f]+);/gi, function(match, numStr) {
      var num = parseInt(numStr, 16);
      return String.fromCharCode(num);
    });
    pdfDoc.text(text, { continued: true });
  }
  token.tokens?.forEach((token) => {
    processMarkdownToken(token, pdfDoc);
  })
}
