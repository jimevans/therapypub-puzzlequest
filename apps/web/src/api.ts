import { type Schemas, createApiClient } from "@puzzlequest/api-client";

/** The client of this site's API. */
export const api = createApiClient(`${location.origin}/api/v1`);

/** The API refused a request; carries the problem it described. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: Schemas["Problem"] | undefined;

  constructor(status: number, problem?: Schemas["Problem"]) {
    super(problem?.detail ?? problem?.title ?? `The API answered ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

/**
 * Gets the data from a response, for code that treats a refusal as an error,
 * as TanStack Query does.
 * @param result what the API client returned
 * @returns the response's data
 * @throws {ApiError} if the API refused the request
 */
export function dataOrThrow<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (!result.response.ok) {
    throw new ApiError(
      result.response.status,
      result.error as Schemas["Problem"] | undefined
    );
  }
  return result.data as T;
}
