// Shared JSDoc type definitions. This module exports nothing at runtime; other
// modules refer to its types with import("./types.js").TypeName.

/**
 * The result of a service operation. A successful result may carry data; an
 * error result always carries a message.
 * @template T the type of the data in a successful result
 * @typedef {{
 *   status: "success",
 *   statusCode: number,
 *   message?: string,
 *   data?: T,
 * } | {
 *   status: "error",
 *   statusCode: number,
 *   message: string,
 *   data?: undefined,
 * }} ServiceResult
 */

export {};
