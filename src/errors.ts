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
