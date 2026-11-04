import { STATUS_CODES } from "http";
import type { NextFunction, Request, Response } from "express";
import { Problems, isV1Request, sendProblem } from "../api/problems.js";

/**
 * Handles errors thrown by routes and middleware, including rejected promises
 * from async handlers, which Express forwards here. Client errors that are
 * meant to be shown (such as malformed JSON from the body parser) keep their
 * status and message; anything else is logged and reported as a generic 500,
 * so that internal details do not reach the client.
 * @param err the error
 * @param req the request
 * @param res the response
 * @param next the next handler
 */
export function errorHandler(
  err: Error & { status?: number; statusCode?: number; expose?: boolean },
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    // Too late to send an error response; let Express close the connection.
    next(err);
    return;
  }
  const status = err.status ?? err.statusCode;
  const isClientError =
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 400 &&
    status < 500;
  if (!isClientError) {
    console.error(`Error handling ${req.method} ${req.originalUrl}:`, err);
  }
  const statusCode = isClientError ? status : 500;
  const message =
    isClientError && err.expose ? err.message : "An unexpected error occurred";
  if (isV1Request(req)) {
    // Client errors here come from Express or its parsers, such as malformed
    // JSON, so they have no problem type of their own.
    sendProblem(
      res,
      isClientError
        ? {
            type: "about:blank",
            title: STATUS_CODES[statusCode] ?? "Error",
            status: statusCode,
          }
        : Problems.unexpected,
      message
    );
  } else if (req.originalUrl.startsWith("/api/")) {
    res.status(statusCode).send(JSON.stringify({ status: "error", message }));
  } else {
    res.status(statusCode).type("text").send(message);
  }
}
