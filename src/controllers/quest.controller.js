import path from "path";
import { fileURLToPath } from "url";
import { PassThrough } from "stream";
import { marked } from "marked";
import { RenderMode } from "../middleware/useRenderMode.js";
import { PuzzleType } from "../models/puzzle.model.js";
import { QuestPuzzleStatus } from "../models/quest.model.js";
import PDFDocument from "pdfkit";
import * as QuestService from "../services/quest.service.js";
import * as UserService from "../services/user.service.js";

export async function createQuest(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to create quests`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to create quests`,
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
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to retrieve quests`,
      })
    );
    return;
  }

  const questFindParams = {
    questName: req.params.name,
  };
  if (!loggedInUser.isAdmin()) {
    questFindParams.userName = await loggedInUser.getAllUserContexts();
  }

  const questResponse = await QuestService.findQuests(questFindParams);
  if (questResponse.status === "error") {
    res.status(questResponse.statusCode).send({
      status: "error",
      message: questResponse.message,
    });
    return;
  }
  res.send(JSON.stringify({
    status: "success",
    data: questResponse.data[0]
  }));
}

export async function updateQuest(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to update quest`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
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
  if (!("name" in req.body)) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: "No quest name in request body",
      })
    );
    return;
  }
  const questToUpdate = QuestService.Quest(req.body);
  const response = await QuestService.updateQuest(questToUpdate);
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
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to delete quests`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${req.user.userName} not authorized to delete quests`,
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
        message: `User ${loggedInUser.userName} not authorized to list quests`,
      })
    );
    return;
  }
  const response = await QuestService.findQuests();
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
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to activate quests`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to activate quests`,
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
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to reset quests`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${loggedInUser.userName} not authorized to reset quests`,
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
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to generate puzzle activation QR codes`,
      })
    );
    return;
  }
  if (!loggedInUser.isAdmin()) {
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
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to activate a quest puzzle`,
      })
    );
    return;
  }
  const userContexts = await loggedInUser.getAllUserContexts();

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

  const activationResult = await QuestService.activatePuzzle(
    req.params.name,
    req.params.puzzleName,
    userContexts,
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
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to solve a quest puzzle`,
      })
    );
    return;
  }
  const userContexts = await loggedInUser.getAllUserContexts();

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

  const solutionResult = await QuestService.finishPuzzle(
    req.params.name,
    req.params.puzzleName,
    userContexts,
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
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to solve a quest puzzle`,
      })
    );
    return;
  }
  const userContexts = await loggedInUser.getAllUserContexts();

  const hintResult = await QuestService.getPuzzleHint(
    req.params.name,
    req.params.puzzleName,
    userContexts
  );
  if (hintResult.status === "error") {
    res.status(hintResult.statusCode).send(
      JSON.stringify({
        status: "error",
        message: hintResult.message,
      })
    );
    return;
  }

  res.send(JSON.stringify(hintResult));
}

export async function renderQuest(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.render("login", { requestingUrl: req.url });
    return;
  }

  const viewName = loggedInUser.isAdmin()
    ? req.renderMode === RenderMode.DISPLAY
      ? "questDetails"
      : "questEdit"
    : "quest";

  if (req.renderMode === RenderMode.CREATE) {
    if (!loggedInUser.isAdmin()) {
      res.render("error", {
        errorTitle: "Unauthorized",
        errorDetails: `User ${req.user.userName} not authorized to create new quests`,
      });
      return;
    }
    res.render(viewName, { renderMode: req.renderMode, quest: null });
    return;
  }

  const questResponse = await QuestService.getQuestByQuestName(
    req.params.name,
    loggedInUser
  );
  if (questResponse.status === "error") {
    res.status(questResponse.statusCode).render("error", {
      errorTitle: "Not found",
      errorDetails: questResponse.message,
    });
  }
  if (questResponse.status === "error") {
    return;
  }
  const quest = questResponse.data;

  // In general, there is only one active puzzle at a time. We
  // already filter the returned puzzles to those being either
  // awaiting activation, activated and in progress, or completed.
  // So all that is left is to get the start time of the single
  // puzzle, if any, that is not completed.
  const inProgressStartTimes = quest.puzzles
    .filter((puzzle) => puzzle.status < QuestPuzzleStatus.COMPLETED)
    .map((puzzle) => puzzle.startTime);
  const currentPuzzleStartTime = inProgressStartTimes.length
    ? inProgressStartTimes[0]
    : undefined;
  res.render(viewName, {
    userName: loggedInUser.userName,
    renderMode: req.renderMode,
    quest: quest,
    currentPuzzleStartTime,
  });
}

export async function renderQuestPuzzle(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.render("login", { requestingUrl: req.url });
    return;
  }

  const questName = req.params.name;
  const questPuzzleResponse = await QuestService.getQuestPuzzle(
    questName,
    req.params.puzzleName,
    loggedInUser
  );
  if (questPuzzleResponse.status === "error") {
    res.status(questPuzzleResponse.statusCode).render("error", {
      errorTitle: "Not found",
      errorDetails: questPuzzleResponse.message,
    });
    return;
  }
  const puzzle = questPuzzleResponse.data;

  if (puzzle.status === QuestPuzzleStatus.AWAITING_ACTIVATION) {
    res.render("activate", {
      userName: loggedInUser.userName,
      quest: questName,
      puzzle: {
        puzzleName: puzzle.puzzleName,
        displayName: puzzle.puzzleDetail.displayName,
      },
    });
    return;
  }

  let renderedPuzzle;
  switch (puzzle.puzzleDetail.type) {
    case PuzzleType.IMAGE:
      renderedPuzzle = `<img src="${puzzle.puzzleDetail.text}" class="pq-puzzle-img" />`;
      break;
    case PuzzleType.AUDIO:
      renderedPuzzle = `<audio src="${puzzle.puzzleDetail.text}" />`;
      break;
    case PuzzleType.VIDEO:
      renderedPuzzle = `<div class="pq-puzzle-video-content"><video src="${puzzle.puzzleDetail.text}" type="video/mp4" playsinline controls /></div>`;
      break;
    default:
      renderedPuzzle = await marked.parse(puzzle.puzzleDetail.text, {
        gfm: true,
      });
  }

  const nextHint =
    puzzle.nextHintToDisplay < puzzle.puzzleDetail.hints.length
      ? puzzle.puzzleDetail.hints[puzzle.nextHintToDisplay]
      : undefined;

  res.render("puzzle", {
    userName: loggedInUser.userName,
    quest: questName,
    puzzle: {
      puzzleName: puzzle.puzzleName,
      displayName: puzzle.puzzleDetail.displayName,
      status: puzzle.status,
      solutionDisplayText: puzzle.puzzleDetail.solutionDisplayText,
      hints: puzzle.puzzleDetail.hints.slice(0, puzzle.nextHintToDisplay),
      nextHintTimePenalty: nextHint ? nextHint.timePenalty : 0,
      nextHintSolutionWarning: nextHint ? nextHint.solutionWarning : undefined,
    },
    rendered: renderedPuzzle,
  });
}

export async function renderPuzzleActivationQRCode(req, res) {
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.render("login", { requestingUrl: req.url.replace(/\/qrcode$/i, "") });
    return;
  }

  if (!loggedInUser.isAdmin()) {
    res.status(403).render("error", {
      errorTitle: "Forbidden",
      errorDetails: `User ${loggedInUser.userName} not authorized to generate puzzle activation QR codes`,
    });
    return;
  }
  const qrCodeResponse = await QuestService.getPuzzleActivationQrCode(
    req.params.name,
    req.params.puzzleName
  );
  if (qrCodeResponse.status === "error") {
    const errorTitle =
      qrCodeResponse.statusCode === 404 ? "Not found" : "Unexpected error";
    const errorDetails = qrCodeResponse.message;
    res
      .status(qrCodeResponse.statusCode)
      .render("error", { errorTitle, errorDetails });
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
  const loggedInUser = UserService.getLoggedInUser(req.user);
  if (!loggedInUser) {
    res.render("login", { requestingUrl: req.url.replace(/\/pdf$/i, "") });
    return;
  }

  if (!loggedInUser.isAdmin()) {
    res.render("error", {
      errorTitle: "Unauthorized",
      errorDetails: `User ${loggedInUser.userName} not authorized to generate quest PDFs`,
    });
    return;
  }

  const questResponse = await QuestService.getQuestByQuestName(
    req.params.name,
    loggedInUser
  );
  if (questResponse.status === "error") {
    res.status(404).render("error", {
      errorTitle: "Not found",
      errorDetails: questResponse.message,
    });
    return;
  }

  const quest = questResponse.data[0];
  const buffers = [];
  const pdfDoc = new PDFDocument({ autoFirstPage: false, bufferPages: true });
  pdfDoc.on("data", buffers.push.bind(buffers));
  pdfDoc.on("end", () => {
    const pdfBuffer = Buffer.concat(buffers);
    res
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=${quest.name}.pdf`,
        "Content-Length": Buffer.byteLength(pdfBuffer),
      })
      .end(pdfBuffer);
  });

  quest.puzzles.forEach((puzzle) => {
    pdfDoc.addPage({ margins: { top: 72, left: 72, right: 72, bottom: 36 } });
    pdfDoc.fontSize(18);
    pdfDoc.text(puzzle.puzzleDetail.displayName, { align: "center" });
    pdfDoc.fontSize(10);
    pdfDoc.moveDown();
    if (puzzle.puzzleDetail.type === 0) {
      new marked.Lexer({ gfm: true })
        .lex(puzzle.puzzleDetail.text)
        .forEach((token) => processMarkdownToken(token, pdfDoc));
      pdfDoc.text("");
    } else if (puzzle.puzzleDetail.type === 1) {
      const dirname = path.dirname(fileURLToPath(import.meta.url));
      const image = path.join(
        dirname,
        "..",
        "public",
        puzzle.puzzleDetail.text
      );
      pdfDoc.image(image, {
        fit: [72 * 6.5, 72 * 8.5],
        align: "center",
        valign: "center",
      });
    } else {
      pdfDoc.text(
        "Puzzle content is audio or video and cannot be rendered on paper."
      );
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
    pdfDoc
      .font("Courier")
      .text(token.text, { continued: true })
      .font("Helvetica");
  }
  if (token.type === "code") {
    pdfDoc
      .font("Courier")
      .text(token.text, { align: "center" })
      .font("Helvetica")
      .fontSize(10);
  }
  if (token.type === "text" || token.type === "escape") {
    const text = token.text.replace(
      /&#x([\dA-Fa-f]+);/gi,
      function (match, numStr) {
        var num = parseInt(numStr, 16);
        return String.fromCharCode(num);
      }
    );
    pdfDoc.text(text, { continued: true });
  }
  token.tokens?.forEach((token) => {
    processMarkdownToken(token, pdfDoc);
  });
}
