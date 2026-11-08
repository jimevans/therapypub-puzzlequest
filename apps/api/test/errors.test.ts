import { afterEach, describe, expect, it, vi } from "vitest";
import { isDuplicateKeyError, unexpectedErrorResult } from "../src/errors.js";
import { recordLogs } from "./logs.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("unexpectedErrorResult", () => {
  it("logs the details and returns a generic error", () => {
    const logs = recordLogs();
    const cause = new Error("connection refused at 10.0.0.5:27017");

    expect(unexpectedErrorResult("saveThing", cause)).toEqual({
      status: "error",
      statusCode: 500,
      message: "An unexpected error occurred",
    });
    expect(logs).toEqual([
      expect.objectContaining({
        level: "error",
        msg: "saveThing failed",
        err: expect.objectContaining({
          message: "connection refused at 10.0.0.5:27017",
        }),
      }),
    ]);
  });
});

describe("isDuplicateKeyError", () => {
  const duplicateEmail = Object.assign(new Error("E11000 duplicate key"), {
    code: 11000,
    keyPattern: { email: 1 },
  });

  it("recognizes MongoDB's duplicate key error", () => {
    expect(isDuplicateKeyError(duplicateEmail)).toBe(true);
  });

  it("checks which field was duplicated", () => {
    expect(isDuplicateKeyError(duplicateEmail, "email")).toBe(true);
    expect(isDuplicateKeyError(duplicateEmail, "userName")).toBe(false);
  });

  it("doesn't match a field when the error doesn't say which it was", () => {
    const unspecified = Object.assign(new Error("E11000"), { code: 11000 });

    expect(isDuplicateKeyError(unspecified)).toBe(true);
    expect(isDuplicateKeyError(unspecified, "email")).toBe(false);
  });

  it.each([
    ["another MongoDB error", Object.assign(new Error("x"), { code: 2 })],
    ["an error without a code", new Error("x")],
    ["a value that isn't an object", "E11000"],
    ["null", null],
  ])("rejects %s", (_, err) => {
    expect(isDuplicateKeyError(err)).toBe(false);
  });
});
