import type { Request } from "express";
import type { ServiceResult } from "../types.js";

/** What a request must include. */
export interface ValidationOptions {
  /** True if the request must have a body. */
  requiresBody?: boolean;
  /** True if the request must include an uploaded file. */
  requiresFile?: boolean;
  /** Properties the request body must contain. */
  requiredBodyProperties?: string[];
}

/**
 * Validates a request.
 * @param validationOptions what the request must include
 * @param request the request
 * @returns a success result, or an error result describing why the request is
 *  invalid
 */
export function validateRequest(
  validationOptions: ValidationOptions = {},
  request: Request
): ServiceResult<undefined> {
  if (validationOptions.requiresFile) {
    if (!request.file) {
      return {
        status: "error",
        statusCode: 400,
        message: "Request must have an uploaded file",
      };
    }
  }

  if (validationOptions.requiresBody) {
    if (!request.body) {
      return {
        status: "error",
        statusCode: 400,
        message: "Request must have a body",
      };
    }
  }

  if (validationOptions.requiredBodyProperties) {
    for (const property of validationOptions.requiredBodyProperties) {
      if (!(property in request.body)) {
        return {
          status: "error",
          statusCode: 400,
          message: `Request body must contain a ${property} property`,
        };
      }
    }
  }
  return { status: "success", statusCode: 200 };
}
