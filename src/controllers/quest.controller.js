import { PassThrough } from "stream";
import { marked } from "marked";
import PDFDocument from "pdfkit";
import { RenderMode } from "../middleware/useRenderMode.js";
import { PuzzleType } from "../models/puzzle.model.js";
import { QuestPuzzleStatus } from "../models/quest.model.js";
import * as QuestService from "../services/quest.service.js";
import * as UserService from "../services/user.service.js";
import * as WebSocketService from "../services/websocket.service.js";
import * as RequestValidationService from "../services/requestValidation.service.js";

export async function createQuest(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true,
      requiresBody: true,
      requiredBodyProperties: ["name", "displayName", "userName"],
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
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
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

  const loggedInUser = UserService.getLoggedInUser(req.user);
  const questResponse = await QuestService.getQuestByQuestName(
    req.params.name,
    loggedInUser
  );
  if (questResponse.status === "error") {
    res.status(questResponse.statusCode).send({
      status: "error",
      message: questResponse.message,
    });
    return;
  }
  res.send(
    JSON.stringify({
      status: "success",
      data: questResponse.data[0],
    })
  );
}

export async function updateQuest(req, res) {
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

  const questToUpdate = new QuestService.Quest(req.body);
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
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresBody: true,
      requiredBodyProperties: ["activationCode"],
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

  const loggedInUser = UserService.getLoggedInUser(req.user);
  const userContexts = await loggedInUser.getAllUserContexts();
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
  WebSocketService.notifyBrowsers(
    [
      `/quest/${req.params.name}`,
      `/quest/${req.params.name}/puzzle/${req.params.puzzleName}`,
      `/monitor/quest/${req.params.name}`,
      `/monitor/quest/${req.params.name}/puzzle/${req.params.puzzleName}`
    ],
    [],
    {
      message: "puzzleActivated",
      questName: req.params.name,
      puzzleName: req.params.puzzleName,
      activationTime: activationResult.data.activationTime
    }
  );
}

export async function solveQuestPuzzle(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresBody: true,
      requiredBodyProperties: ["guess"],
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

  const loggedInUser = UserService.getLoggedInUser(req.user);
  const userContexts = await loggedInUser.getAllUserContexts();
  const solutionGuess = req.body.guess;
  const connectionId = req.body.connectionId;
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
  res.send(JSON.stringify({
    status: "success",
    data: {
      solutionText: solutionResult.data.solutionText,
      questComplete: solutionResult.data.questComplete
    }
  }));
  WebSocketService.notifyBrowsers(
    [
      `/quest/${req.params.name}`,
      `/quest/${req.params.name}/puzzle/${req.params.puzzleName}`,
      `/monitor/quest/${req.params.name}`,
      `/monitor/quest/${req.params.name}/puzzle/${req.params.puzzleName}`
    ],
    [connectionId],
    {
      message: "puzzleSolved",
      questName: req.params.name,
      puzzleName: req.params.puzzleName,
      solutionText: solutionResult.data.solutionText,
      endTime: solutionResult.data.endTime,
      questComplete: solutionResult.data.questComplete
    }
  );
  if (solutionResult.data.nextPuzzleName) {
    WebSocketService.notifyBrowsers(
      [
        `/quest/${req.params.name}`,
        `/quest/${req.params.name}/puzzle/${req.params.puzzleName}`,
        `/monitor/quest/${req.params.name}`,
        `/monitor/quest/${req.params.name}/puzzle/${req.params.puzzleName}`
      ],
      [connectionId],
      {
        message: "puzzleStarted",
        questName: req.params.name,
        puzzleName: solutionResult.data.nextPuzzleName,
        displayName: solutionResult.data.nextPuzzleDisplayName,
        startTime: solutionResult.data.endTime
      }
    );
  }
}

export async function requestQuestPuzzleHint(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresBody: true
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

  const loggedInUser = UserService.getLoggedInUser(req.user);
  const userContexts = await loggedInUser.getAllUserContexts();
  const connectionId = req.body.connectionId;
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

  WebSocketService.notifyBrowsers(
    [
      `/quest/${req.params.name}/puzzle/${req.params.puzzleName}`,
      `/monitor/quest/${req.params.name}/puzzle/${req.params.puzzleName}`
     ],
    [connectionId],
    {
      message: "hintRequested",
      hintText: hintResult.data.hintText,
      moreHints: hintResult.data.moreHints,
      timePenalty: hintResult.data.timePenalty,
      isNextHintSolution: hintResult.data.isNextHintSolution,
    }
  );
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
  const buffers = [];
  const pdfDoc = new PDFDocument({ autoFirstPage: false, bufferPages: true });
  pdfDoc.on("data", buffers.push.bind(buffers));
  pdfDoc.on("end", () => {
    const pdfBuffer = Buffer.concat(buffers);
    res
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=${req.params.name}.pdf`,
        "Content-Length": Buffer.byteLength(pdfBuffer),
      })
      .end(pdfBuffer);
  });

  const pdfResult = await QuestService.getQuestRunBook(req.params.name, pdfDoc);
  if (pdfResult.status === "error") {
    // No need to render for the success case; the "end" event handler will render
    res.render("error", {
      errorTitle: "Unexpected error",
      errorDetails: pdfResult.message,
    });
  }
}

export async function renderMonitoredQuest(req, res) {
  const questResponse = await QuestService.getQuestByQuestName(
    req.params.name,
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
  res.render("monitorQuest", {
    quest: quest,
    currentPuzzleStartTime,
  });
}

export async function renderMonitoredQuestPuzzle(req, res) {
  const questName = req.params.name;
  const questPuzzleResponse = await QuestService.getQuestPuzzle(
    questName,
    req.params.puzzleName
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
    res.render("error", {
      errorTitle: "Not found",
      errorDetails: "Puzzle not found",
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

  res.render("monitorPuzzle", {
    quest: questName,
    puzzle: {
      puzzleName: puzzle.puzzleName,
      displayName: puzzle.puzzleDetail.displayName,
      status: puzzle.status,
      solutionDisplayText: puzzle.puzzleDetail.solutionDisplayText,
      hints: puzzle.puzzleDetail.hints.slice(0, puzzle.nextHintToDisplay)
    },
    rendered: renderedPuzzle,
  });
}
