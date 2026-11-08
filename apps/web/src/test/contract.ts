// Contract tests: the answers tests fake for the API client must be ones the
// API could really give, as its published description says, or the screens
// would be tested against data the server never sends. Each spy on the
// client's methods is noted as it's made, and its answers are checked after
// the test (see setup.ts); a spy keeps its record when a test restores it.
import { vi } from "vitest";
import description from "@puzzlequest/api-client/openapi.json" with { type: "json" };
import { createContract } from "@puzzlequest/api-client/contract";

const contract = createContract(description);
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/** What the API client returns: openapi-fetch's result. */
interface FakedResult {
  data?: unknown;
  error?: unknown;
  response?: Response;
}

type Spy = ReturnType<typeof vi.fn>;
let spies: { method: string; spy: Spy }[] = [];

/** Starts noting each spy made on the API client's methods. */
export function noteSpiesOnTheApi(): void {
  const spyOn = vi.spyOn.bind(vi);
  vi.spyOn = ((target: object, name: string, ...rest: never[]) => {
    const spy = (spyOn as (...args: unknown[]) => Spy)(target, name, ...rest);
    // The API client: openapi-fetch's methods, beside its middleware.
    if (
      METHODS.has(name) &&
      typeof (target as { use?: unknown }).use === "function"
    ) {
      spies.push({ method: name, spy });
    }
    return spy;
  }) as typeof vi.spyOn;
}

/**
 * Checks the answers faked since the last check, and forgets the spies.
 * @returns what isn't an answer the API could give, one line each
 */
export function fakedAnswerMismatches(): string[] {
  const mismatches: string[] = [];
  for (const { method, spy } of spies) {
    spy.mock.settledResults.forEach((result, index) => {
      // A rejection stands for a request that never reached the server.
      if (result.type !== "fulfilled") {
        return;
      }
      const path = spy.mock.calls[index][0] as string;
      const { data, error, response } = result.value as FakedResult;
      if (response === undefined) {
        mismatches.push(
          `${method} ${path}: the faked answer has no response, so its status is unknown`
        );
        return;
      }
      const body = response.ok ? data : error;
      const mismatch = contract.check({
        method,
        path,
        status: response.status,
        mediaType:
          body === undefined
            ? undefined
            : response.ok
              ? "application/json"
              : "application/problem+json",
        body,
      });
      if (mismatch !== undefined) {
        mismatches.push(mismatch);
      }
    });
  }
  spies = [];
  return mismatches;
}
