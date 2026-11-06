import { QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api";
import { goToSignIn } from "../session";

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
 * Sends the visitor to sign in if their session has ended while a screen was
 * open. Only for fetching data: a form that gets a 401, such as signing in with
 * the wrong password, says so itself.
 * @param error why a query failed
 */
export function signInIfSessionEnded(error: unknown): void {
  if (error instanceof ApiError && error.status === 401) {
    goToSignIn();
  }
}

/**
 * Creates the store of data fetched from the API.
 * @returns the client
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: signInIfSessionEnded }),
    defaultOptions: { queries: { retry: shouldRetry } },
  });
}
