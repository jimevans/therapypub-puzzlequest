import type { Request, RequestHandler } from "express";
import type { z } from "zod";
import { Problems, isV1Request, sendProblem } from "../api/problems.js";

/** The schemas a request's parts must match; each part is optional. */
export interface RequestSchemas {
  /** The schema for the request body. */
  body?: z.ZodType;
  /** The schema for the query string's parameters. */
  query?: z.ZodType;
  /** The schema for the path's parameters. */
  params?: z.ZodType;
}

/** A problem with one field of a request. */
export interface FieldError {
  /** Where the field is, such as "body.email" or "body.hints.0.text". */
  path: string;
  /** What is wrong with it. */
  message: string;
}

/** The parts of a request a schema can check. */
type RequestPart = keyof RequestSchemas;

/**
 * Replaces one part of a request with what its schema parsed. Express 5
 * defines the query as a getter, so it is replaced with a property of the
 * request itself.
 * @param req the request
 * @param part the part
 * @param value the parsed value
 */
function replacePart(req: Request, part: RequestPart, value: unknown): void {
  if (part === "query") {
    Object.defineProperty(req, "query", {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    return;
  }
  (req as unknown as Record<string, unknown>)[part] = value;
}

/**
 * Creates middleware that checks a request against schemas, and replaces
 * each part checked with what its schema parses: values converted to their
 * types, and fields the schema doesn't define dropped, so handlers never see
 * properties a client added. An invalid request gets a 400 listing the
 * problems. Use it after authorization, so a refused request gets a 401 or
 * 403 rather than a 400, and after multer for multipart requests, whose
 * body multer parses.
 * @param schemas the schemas
 * @returns the middleware
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  const parts = (["params", "query", "body"] as const).filter(
    (part) => schemas[part] !== undefined
  );
  return (req, res, next) => {
    const errors: FieldError[] = [];
    const parsed: [RequestPart, unknown][] = [];
    for (const part of parts) {
      const result = schemas[part]!.safeParse(req[part] ?? {});
      if (result.success) {
        parsed.push([part, result.data]);
      } else {
        errors.push(
          ...result.error.issues.map((issue) => ({
            path: [part, ...issue.path].join("."),
            message: issue.message,
          }))
        );
      }
    }
    if (!errors.length) {
      for (const [part, value] of parsed) {
        replacePart(req, part, value);
      }
      next();
      return;
    }
    // Pages show this to people, so it names fields without "body."; the
    // errors list has full paths.
    const message = errors
      .map((error) => `${error.path.replace(/^body\./, "")}: ${error.message}`)
      .join("; ");
    if (isV1Request(req)) {
      sendProblem(res, Problems.invalidRequest, message, { errors });
      return;
    }
    res.status(400).json({ status: "error", message, errors });
  };
}
