import { User } from "./user.service.js";

/**
 * Validates a request.
 * @param {object} validationOptions the options for validating the request
 * @param {boolean | undefined} validationOptions.requiresUser true if a logged in user is required in this request; otherwise, false
 * @param {boolean | undefined} validationOptions.requiresAdmin true if the request requires administrative access; otherwise, false
 * @param {boolean | undefined} validationOptions.requiresBody true if the request requires a body in the request; otherwise, false
 * @param {boolean | undefined} validationOptions.requiresFile true if the request requires an uploaded file; otherwise, false
 * @param {string[] | undefined} validationOptions.requiredBodyProperties an array of the properties required in the body
 * @param {object | null} request the request
 * @returns
 */
export function validateRequest(validationOptions = {}, request = null) {
  if (validationOptions.requiresUser) {
    if (!request.user) {
      return {
        status: "error",
        statusCode: 401,
        message: "User must be logged in to perform operation"
      }
    }
  }

  if (validationOptions.requiresAdmin) {
    const loggedInUser = request.user ? new User(request.user) : null;
    if (!loggedInUser?.isAdmin()) {
      return {
        status: "error",
        statusCode: 403,
        message: `User ${loggedInUser.userName} not authorized perform operation`,
      };
    }
  }

  if (validationOptions.requiresFile) {
    if (!request.file) {
      return {
        status: "error",
        statusCode: 400,
        message: "Request must have an uploaded file"
      }
    }
  }

  if (validationOptions.requiresBody) {
    if (!request.body) {
      return {
        status: "error",
        statusCode: 400,
        message: "Request must have a body"
      }
    }
  }

  if (validationOptions.requiredBodyProperties) {
    for (const property of validationOptions.requiredBodyProperties) {
      if (!(property in request.body)) {
        return {
          status: "error",
          statusCode: 400,
          message: `Request body must contain a ${property} property`
        }
      }
    }
  }
  return { status: "success", statusCode: 200 };
}
