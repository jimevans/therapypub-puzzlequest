import { STATUS_CODES } from "http";
import type { NextFunction, Request, Response } from "express";
import {
  Problems,
  type ProblemType,
  isV1Request,
  sendProblem,
} from "../api/problems.js";
import { sendErrorPage } from "../errorPage.js";

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
  err: Error & {
    status?: number;
    statusCode?: number;
    expose?: boolean;
    /** The kind of problem, for the v1 API, when the error says. */
    problem?: ProblemType;
  },
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
    // A client error has a problem type when it comes from this
    // application, such as a rejected upload; one from Express or its
    // parsers, such as malformed JSON, doesn't.
    sendProblem(
      res,
      isClientError && err.problem
        ? err.problem
        : isClientError
          ? {
              type: "about:blank",
              title: STATUS_CODES[statusCode] ?? "Error",
              status: statusCode,
            }
          : Problems.unexpected,
      message
    );
  } else {
    sendErrorPage(
      res,
      statusCode,
      STATUS_CODES[statusCode] ?? "Error",
      message
    );
  }
}
