/**
 * Handles errors thrown by routes and middleware, including rejected promises
 * from async handlers, which Express forwards here. Client errors that are
 * meant to be shown (such as malformed JSON from the body parser) keep their
 * status and message; anything else is logged and reported as a generic 500,
 * so that internal details do not reach the client.
 * @param {Error & {status?: number, statusCode?: number, expose?: boolean}} err the error
 * @param {import("express").Request} req the request
 * @param {import("express").Response} res the response
 * @param {import("express").NextFunction} next the next handler
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    // Too late to send an error response; let Express close the connection.
    next(err);
    return;
  }
  const status = err.status ?? err.statusCode;
  const isClientError =
    Number.isInteger(status) && status >= 400 && status < 500;
  if (!isClientError) {
    console.error(`Error handling ${req.method} ${req.originalUrl}:`, err);
  }
  const statusCode = isClientError ? status : 500;
  const message =
    isClientError && err.expose ? err.message : "An unexpected error occurred";
  if (req.originalUrl.startsWith("/api/")) {
    res.status(statusCode).send(JSON.stringify({ status: "error", message }));
  } else {
    res.status(statusCode).type("text").send(message);
  }
}
