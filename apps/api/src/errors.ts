import { log } from "./logger.js";

/**
 * Gets a message describing a caught value. JavaScript can throw anything, so
 * a caught value isn't necessarily an Error.
 * @param err the caught value
 * @returns the error's message, or the value as text
 */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Gets a caught value as an Error, wrapping it if it isn't one already.
 * @param err the caught value
 * @returns the value, if it's an Error; otherwise, an Error describing it
 */
export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/** The message sent to clients when an operation fails unexpectedly. */
export const UNEXPECTED_ERROR_MESSAGE = "An unexpected error occurred";

/**
 * Logs an unexpected failure and gets the error result to return. The
 * details, which can describe the database or other internals, go to the
 * log, not to the client.
 * @param action what was being done, for the log
 * @param err the caught value
 * @returns the error result
 */
export function unexpectedErrorResult(
  action: string,
  err: unknown
): { status: "error"; statusCode: 500; message: string } {
  log().error({ err }, `${action} failed`);
  return {
    status: "error",
    statusCode: 500,
    message: UNEXPECTED_ERROR_MESSAGE,
  };
}

/**
 * Determines whether a caught value is MongoDB's error for a value that
 * must be unique but isn't.
 * @param err the caught value
 * @param field the field to check for; omit for any field
 * @returns true if it's a duplicate key error (on the field, if given)
 */
export function isDuplicateKeyError(err: unknown, field?: string): boolean {
  if (
    typeof err !== "object" ||
    err === null ||
    !("code" in err) ||
    err.code !== 11000
  ) {
    return false;
  }
  if (field === undefined) {
    return true;
  }
  const keyPattern = "keyPattern" in err ? err.keyPattern : undefined;
  return typeof keyPattern === "object" && keyPattern !== null
    ? field in keyPattern
    : false;
}
