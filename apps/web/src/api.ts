import { createApiClient } from "@puzzlequest/api-client";

/** The client of this site's API. */
export const api = createApiClient(`${location.origin}/api/v1`);
