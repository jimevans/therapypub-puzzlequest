import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { pinoHttp } from "pino-http";
import { logger, runWithRequestLogger } from "../logger.js";

/** The header that carries a request's ID back to the client. */
export const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * Says whether a request is for a file whose every load isn't worth a log
 * entry: the app's built files, styles, images, and uploaded media, and the
 * health check, which monitors ask for often.
 * @param path the request's path
 * @returns true to leave it out of the log
 */
function isUnremarkable(path: string): boolean {
  return (
    path === "/healthz" ||
    /^\/(assets|style|image|puzzleData)\//.test(path) ||
    /^\/[\w.-]+\.(ico|png|svg|webmanifest|js)$/.test(path)
  );
}

const httpLogger = pinoHttp({
  logger,
  // Always made here, never taken from the request, so a client can't put
  // misleading IDs in the log.
  genReqId: (_req, res) => {
    const id = randomUUID();
    res.setHeader(REQUEST_ID_HEADER, id);
    return id;
  },
  autoLogging: {
    ignore: (req) =>
      isUnremarkable(new URL(req.url ?? "/", "http://x").pathname),
  },
  // Entries logged while handling a request carry only its ID; the entry
  // when it finishes says what it was.
  quietReqLogger: true,
  customLogLevel: (_req, res, err) =>
    err || res.statusCode >= 500 ? "error" : "info",
  customSuccessMessage: () => "request completed",
  customErrorMessage: () => "request failed",
  // The method, the path without its query (which can hold a reset link's
  // token), the status, and how long it took: never headers or bodies.
  serializers: {
    req: (req: { id: string; method: string; url: string }) => ({
      id: req.id,
      method: req.method,
      path: new URL(req.url, "http://x").pathname,
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
  wrapSerializers: false,
});

/**
 * Gives each request an ID, sent back in the X-Request-Id header, and logs
 * it when its response is finished. Everything logged while handling it, by
 * log(), carries the same ID.
 * @param req the request
 * @param res the response
 * @param next the next handler
 */
export function logRequests(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  httpLogger(req, res);
  runWithRequestLogger(req.log, next);
}
