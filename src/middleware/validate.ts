import type { RequestHandler } from "express";
import type { z } from "zod";

/** The schemas a request's parts must match. */
export interface RequestSchemas {
  /** The schema for the request body. */
  body: z.ZodType;
}

/** A problem with one field of a request. */
export interface FieldError {
  /** Where the field is, such as "body.email" or "body.hints.0.text". */
  path: string;
  /** What is wrong with it. */
  message: string;
}

/**
 * Creates middleware that checks a request against schemas, and replaces the
 * body with what the schema parses: values converted to their types, and
 * fields the schema doesn't define dropped, so handlers never see properties
 * a client added. An invalid request gets a 400 listing the problems. Use it
 * after authorization, so a refused request gets a 401 or 403 rather than a
 * 400, and after multer for multipart requests, whose body multer parses.
 * @param schemas the schemas
 * @returns the middleware
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, res, next) => {
    const result = schemas.body.safeParse(req.body ?? {});
    if (result.success) {
      req.body = result.data;
      next();
      return;
    }
    const errors: FieldError[] = result.error.issues.map((issue) => ({
      path: ["body", ...issue.path].join("."),
      message: issue.message,
    }));
    res.status(400).json({
      status: "error",
      // Pages show this to people, so it names fields without "body."; the
      // errors list has full paths.
      message: errors
        .map(
          (error) => `${error.path.replace(/^body\./, "")}: ${error.message}`
        )
        .join("; "),
      errors,
    });
  };
}
