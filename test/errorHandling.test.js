import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createMockResponse } from "./helpers.js";

vi.mock("../src/services/authentication.service.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, authenticate: vi.fn() };
});

const AuthenticationService =
  await import("../src/services/authentication.service.js");
const { createApp } = await import("../src/createApp.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("error handling in the app", () => {
  it("reports a rejected promise from an async handler as a 500 without details", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    AuthenticationService.authenticate.mockRejectedValue(
      new Error("database exploded")
    );

    const response = await request(createApp())
      .post("/api/user/login")
      .send({ userName: "player", password: "password" });

    expect(response.status).toBe(500);
    expect(JSON.parse(response.text)).toEqual({
      status: "error",
      message: "An unexpected error occurred",
    });
    expect(response.text).not.toContain("database exploded");
    expect(consoleError).toHaveBeenCalled();
  });

  it("reports malformed JSON as a 400 with the parser's message", async () => {
    const response = await request(createApp())
      .post("/api/user/login")
      .set("Content-Type", "application/json")
      .send('{"userName": ');

    expect(response.status).toBe(400);
    const body = JSON.parse(response.text);
    expect(body.status).toBe("error");
    expect(body.message).toMatch(/JSON/);
  });
});

describe("errorHandler", () => {
  function createRequest(originalUrl) {
    return { method: "GET", originalUrl };
  }

  it("responds with plain text outside the API", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = createMockResponse();
    res.type = vi.fn(() => res);
    // The shared mock parses bodies as JSON; this one is plain text.
    res.send = vi.fn(() => res);

    errorHandler(new Error("boom"), createRequest("/quest/q1"), res, vi.fn());

    expect(res.statusCode).toBe(500);
    expect(res.type).toHaveBeenCalledWith("text");
    expect(res.send).toHaveBeenCalledWith("An unexpected error occurred");
  });

  it("hides the message of a client error that is not meant to be shown", () => {
    const res = createMockResponse();
    const err = Object.assign(new Error("internal detail"), { status: 404 });

    errorHandler(err, createRequest("/api/quest/q1"), res, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("An unexpected error occurred");
  });

  it("passes the error on when the response has already started", () => {
    const res = createMockResponse();
    res.headersSent = true;
    const next = vi.fn();
    const err = new Error("late");

    errorHandler(err, createRequest("/api/user/login"), res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.send).not.toHaveBeenCalled();
  });
});
