import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api";

/** Failed requests that could succeed if sent again are retried this often. */
const MAX_RETRIES = 2;

/**
 * Decides whether to send a failed request again. The API refusing a request
 * won't change its mind, unless it's asking the client to slow down or failing
 * itself; a request that got no answer may simply have hit a dead zone.
 * @param failures how many times the request has failed
 * @param error why it failed
 * @returns whether to try again
 */
export function shouldRetry(failures: number, error: unknown): boolean {
  if (failures > MAX_RETRIES) {
    return false;
  }
  return !(error instanceof ApiError) || error.status >= 500;
}

/**
 * Creates the store of data fetched from the API.
 * @returns the client
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry } },
  });
}
