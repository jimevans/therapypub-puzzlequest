import type { Response } from "express";
import type { RouteRequest } from "../types.js";
import { PassThrough } from "stream";
import { marked } from "marked";
import PDFDocument from "pdfkit";
import { RenderMode } from "../middleware/useRenderMode.js";
import { PuzzleType } from "../models/puzzle.model.js";
import { QuestPuzzleStatus } from "../models/quest.model.js";
import * as QuestService from "../services/quest.service.js";
import * as UserService from "../services/user.service.js";
import { sendWebApp } from "./web.controller.js";

export async function renderQuest(
  req: RouteRequest<"name">,
  res: Response
): Promise<void> {
  // The route requires a signed-in user.
  const loggedInUser = UserService.requireLoggedInUser(req.user);
  // Only administrators can reach the routes that create and edit a quest.
  if (!loggedInUser.isAdmin()) {
    sendWebApp(req, res);
    return;
  }
  const viewName =
    req.renderMode === RenderMode.DISPLAY ? "questDetails" : "questEdit";

  if (req.renderMode === RenderMode.CREATE) {
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
  // The route requires a signed-in user.
  const loggedInUser = UserService.requireLoggedInUser(req.user);
  const questName = req.params.name;
  const questPuzzleResponse = await QuestService.getQuestAndPuzzle(
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
  const { quest, puzzle } = questPuzzleResponse.data;
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
      paused: quest.paused,
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
    paused: quest.paused,
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
  const questResponse = await QuestService.getSpectatedQuest(req.params.name);
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
  const questPuzzleResponse = await QuestService.getSpectatedQuestPuzzle(
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
  const { quest, puzzle, detail: puzzleDetail } = questPuzzleResponse.data;

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
    paused: quest.paused,
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
