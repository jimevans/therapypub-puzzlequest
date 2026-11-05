// A typed client for the PuzzleQuest API. openapi.json and schema.d.ts are
// generated from the server's routes (`npm run generate:api`), so a client
// can't call a route that doesn't exist or misread what one returns.
import createClient, { type Client } from "openapi-fetch";
import type { components, paths } from "./schema.js";

export * from "./live.js";

/** The API's resources and messages, by name, such as Schemas["Session"]. */
export type Schemas = components["schemas"];

/** A client of the API. */
export type ApiClient = Client<paths>;

/**
 * Creates a client of the API.
 * @param baseUrl the API's address, such as https://example.com/api/v1
 * @returns the client
 */
export function createApiClient(baseUrl: string): ApiClient {
  return createClient<paths>({ baseUrl });
}
