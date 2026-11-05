import { describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { shouldRetry } from "./queryClient";

describe("shouldRetry", () => {
  it("retries a request that got no answer", () => {
    expect(shouldRetry(0, new TypeError("Failed to fetch"))).toBe(true);
  });

  it("retries when the server failed", () => {
    expect(shouldRetry(0, new ApiError(503))).toBe(true);
  });

  it("doesn't retry when the API refused the request", () => {
    expect(shouldRetry(0, new ApiError(404))).toBe(false);
    expect(shouldRetry(0, new ApiError(422))).toBe(false);
  });

  it("gives up in the end", () => {
    expect(shouldRetry(2, new ApiError(503))).toBe(true);
    expect(shouldRetry(3, new ApiError(503))).toBe(false);
  });
});
