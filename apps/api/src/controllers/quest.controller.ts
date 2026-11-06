import type { Response } from "express";
import type { RouteRequest } from "../types.js";
import { PassThrough } from "stream";
import PDFDocument from "pdfkit";
import { RenderMode } from "../middleware/useRenderMode.js";
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
