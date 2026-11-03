import type { Request, Response } from "express";
import type { RouteRequest } from "../types.js";
import { PassThrough } from "stream";
import { marked } from "marked";
import PDFDocument from "pdfkit";
import { RenderMode } from "../middleware/useRenderMode.js";
import { PuzzleType } from "../models/puzzle.model.js";
import { QuestPuzzleStatus } from "../models/quest.model.js";
import * as QuestService from "../services/quest.service.js";
import * as UserService from "../services/user.service.js";
import * as RequestValidationService from "../services/requestValidation.service.js";

export async function createQuest(req: Request, res: Response): Promise<void> {
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

export async function retrieveQuest(
  req: RouteRequest<"name">,
  res: Response
): Promise<void> {
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

  const loggedInUser = UserService.requireLoggedInUser(req.user);
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
  const visibleQuest = loggedInUser.isAdmin()
    ? questResponse.data.toJSON()
    : questResponse.data.toPlayerJSON();
  res.send(
    JSON.stringify({
      status: "success",
      data: visibleQuest,
    })
  );
}

export async function updateQuest(req: Request, res: Response): Promise<void> {
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

  const questToUpdate: QuestService.QuestDefinition & { name: string } =
    new QuestService.Quest(req.body);
  if (!("puzzles" in req.body)) {
    // The Quest class defaults to an empty puzzle list, which would remove
    // every puzzle; leaving the list out of a request keeps it unchanged.
    questToUpdate.puzzles = undefined;
  }
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

export async function deleteQuest(
  req: RouteRequest<"name">,
  res: Response
): Promise<void> {
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
    return;
  }
  res.send(JSON.stringify(response));
}

export async function listQuests(req: Request, res: Response): Promise<void> {
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
  if (response.status === "error" && response.statusCode === 404) {
    // No quests yet; the list is empty, so the first one can be created.
    res.send(JSON.stringify({ status: "success", data: [] }));
    return;
  }
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

export async function activateQuest(
  req: RouteRequest<"name">,
  res: Response
): Promise<void> {
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

  const startQuestResponse = await QuestService.startQuest(req.params.name, {
    actor: req.user?.userName,
  });
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

export async function resetQuest(
  req: RouteRequest<"name">,
  res: Response
): Promise<void> {
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

  const resetQuestResponse = await QuestService.resetQuest(req.params.name, {
    actor: req.user?.userName,
  });
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

export async function generatePuzzleActivationQRCode(
  req: RouteRequest<"name" | "puzzleName">,
  res: Response
): Promise<void> {
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

export async function activateQuestPuzzle(
  req: RouteRequest<"name" | "puzzleName">,
  res: Response
): Promise<void> {
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

  const loggedInUser = UserService.requireLoggedInUser(req.user);
  const userContexts = await loggedInUser.getAllUserContexts();
  const activationCode = req.qrCodeData
    ? req.qrCodeData
    : req.body.activationCode;

  const activationResult = await QuestService.activatePuzzle(
    req.params.name,
    req.params.puzzleName,
    userContexts,
    activationCode,
    { actor: loggedInUser.userName }
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

export async function solveQuestPuzzle(
  req: RouteRequest<"name" | "puzzleName">,
  res: Response
): Promise<void> {
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

  const loggedInUser = UserService.requireLoggedInUser(req.user);
  const userContexts = await loggedInUser.getAllUserContexts();
  const solutionGuess = req.body.guess;
  const connectionId = req.body.connectionId;
  const solutionResult = await QuestService.finishPuzzle(
    req.params.name,
    req.params.puzzleName,
    userContexts,
    solutionGuess,
    { actor: loggedInUser.userName, connectionId }
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
  res.send(
    JSON.stringify({
      status: "success",
      data: {
        solutionText: solutionResult.data.solutionText,
        questComplete: solutionResult.data.questComplete,
      },
    })
  );
}

export async function requestQuestPuzzleHint(
  req: RouteRequest<"name" | "puzzleName">,
  res: Response
): Promise<void> {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresBody: true,
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

  const loggedInUser = UserService.requireLoggedInUser(req.user);
  const userContexts = await loggedInUser.getAllUserContexts();
  const connectionId = req.body.connectionId;
  const hintResult = await QuestService.getPuzzleHint(
    req.params.name,
    req.params.puzzleName,
    userContexts,
    { actor: loggedInUser.userName, connectionId }
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

export async function renderQuest(
  req: RouteRequest<"name">,
  res: Response
): Promise<void> {
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
        errorDetails: `User ${loggedInUser.userName} not authorized to create new quests`,
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
    return;
  }

  const quest = questResponse.data;

  res.render(viewName, {
    userName: loggedInUser.userName,
    renderMode: req.renderMode,
    quest: quest,
    progress: quest.getProgress(),
  });
}

export async function renderQuestPuzzle(
  req: RouteRequest<"name" | "puzzleName">,
  res: Response
): Promise<void> {
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
  // A puzzle deleted after it was added to the quest has no details.
  const puzzleDetail = puzzle.puzzleDetail;
  if (!puzzleDetail) {
    res.status(404).render("error", {
      errorTitle: "Not found",
      errorDetails: `Puzzle ${req.params.puzzleName} no longer exists`,
    });
    return;
  }

  if (puzzle.status === QuestPuzzleStatus.AWAITING_ACTIVATION) {
    res.render("activate", {
      userName: loggedInUser.userName,
      quest: questName,
      puzzle: {
        puzzleName: puzzle.puzzleName,
        displayName: puzzleDetail.displayName,
      },
    });
    return;
  }

  let renderedPuzzle;
  switch (puzzleDetail.type) {
    case PuzzleType.IMAGE:
      renderedPuzzle = `<img src="${puzzleDetail.text}" class="pq-puzzle-img" />`;
      break;
    case PuzzleType.AUDIO:
      renderedPuzzle = `<audio src="${puzzleDetail.text}" />`;
      break;
    case PuzzleType.VIDEO:
      renderedPuzzle = `<div class="pq-puzzle-video-content"><video src="${puzzleDetail.text}" type="video/mp4" playsinline controls /></div>`;
      break;
    default:
      renderedPuzzle = await marked.parse(puzzleDetail.text, {
        gfm: true,
      });
  }

  const nextHint =
    puzzle.nextHintToDisplay < puzzleDetail.hints.length
      ? puzzleDetail.hints[puzzle.nextHintToDisplay]
      : undefined;

  res.render("puzzle", {
    userName: loggedInUser.userName,
    quest: questName,
    puzzle: {
      puzzleName: puzzle.puzzleName,
      displayName: puzzleDetail.displayName,
      status: puzzle.status,
      solutionDisplayText: puzzleDetail.solutionDisplayText,
      hints: puzzleDetail.hints.slice(0, puzzle.nextHintToDisplay),
      nextHintTimePenalty: nextHint ? nextHint.timePenalty : 0,
      nextHintSolutionWarning: nextHint ? nextHint.solutionWarning : undefined,
    },
    rendered: renderedPuzzle,
  });
}

export async function renderPuzzleActivationQRCode(
  req: RouteRequest<"name" | "puzzleName">,
  res: Response
): Promise<void> {
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

export async function renderQuestRunBook(
  req: RouteRequest<"name">,
  res: Response
): Promise<void> {
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
  const buffers: Buffer[] = [];
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

export async function renderMonitoredQuest(
  req: RouteRequest<"name">,
  res: Response
): Promise<void> {
  const questResponse = await QuestService.getQuestByQuestName(req.params.name);
  if (questResponse.status === "error") {
    res.status(questResponse.statusCode).render("error", {
      errorTitle: "Not found",
      errorDetails: questResponse.message,
    });
    return;
  }

  const quest = questResponse.data;

  res.render("monitorQuest", {
    quest: quest,
    progress: quest.getProgress(),
  });
}

export async function renderMonitoredQuestPuzzle(
  req: RouteRequest<"name" | "puzzleName">,
  res: Response
): Promise<void> {
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
  // A puzzle deleted after it was added to the quest has no details.
  const puzzleDetail = puzzle.puzzleDetail;
  if (!puzzleDetail) {
    res.status(404).render("error", {
      errorTitle: "Not found",
      errorDetails: `Puzzle ${req.params.puzzleName} no longer exists`,
    });
    return;
  }

  if (puzzle.status < QuestPuzzleStatus.IN_PROGRESS) {
    res.render("error", {
      errorTitle: "Not found",
      errorDetails: "Puzzle not found",
    });
    return;
  }

  let renderedPuzzle;
  switch (puzzleDetail.type) {
    case PuzzleType.IMAGE:
      renderedPuzzle = `<img src="${puzzleDetail.text}" class="pq-puzzle-img" />`;
      break;
    case PuzzleType.AUDIO:
      renderedPuzzle = `<audio src="${puzzleDetail.text}" />`;
      break;
    case PuzzleType.VIDEO:
      renderedPuzzle = `<div class="pq-puzzle-video-content"><video src="${puzzleDetail.text}" type="video/mp4" playsinline controls /></div>`;
      break;
    default:
      renderedPuzzle = await marked.parse(puzzleDetail.text, {
        gfm: true,
      });
  }

  res.render("monitorPuzzle", {
    quest: questName,
    puzzle: {
      puzzleName: puzzle.puzzleName,
      displayName: puzzleDetail.displayName,
      status: puzzle.status,
      solutionDisplayText: puzzleDetail.solutionDisplayText,
      hints: puzzleDetail.hints.slice(0, puzzle.nextHintToDisplay),
    },
    rendered: renderedPuzzle,
  });
}
