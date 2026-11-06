import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { shouldRetry, signInIfSessionEnded } from "./queryClient";

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

describe("signInIfSessionEnded", () => {
  const assign = vi.fn();

  afterEach(() => {
    assign.mockClear();
    vi.unstubAllGlobals();
  });

  function stubLocation() {
    vi.stubGlobal("location", {
      assign,
      pathname: "/quest/trail",
      search: "?a=1",
    });
  }

  it("sends the visitor to sign in, and back to this page", () => {
    stubLocation();

    signInIfSessionEnded(new ApiError(401));

    expect(assign).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent("/quest/trail?a=1")}`
    );
  });

  it("leaves any other failure to the screen", () => {
    stubLocation();

    signInIfSessionEnded(new ApiError(404));
    signInIfSessionEnded(new TypeError("Failed to fetch"));

    expect(assign).not.toHaveBeenCalled();
  });
});
