import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import request from "supertest";
import { createMockResponse } from "./helpers.js";

vi.mock("../src/services/authentication.service.js", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../src/services/authentication.service.js")
    >();
  return { ...original, authenticate: vi.fn() };
});

const AuthenticationService =
  await import("../src/services/authentication.service.js");
const { createApp } = await import("../src/createApp.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");

const { recordLogs } = await import("./logs.js");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("error handling in the app", () => {
  it("reports a rejected promise from an async handler as a 500 without details", async () => {
    const logs = recordLogs();
    vi.mocked(AuthenticationService.authenticate).mockRejectedValue(
      new Error("database exploded")
    );

    const response = await request(createApp())
      .post("/api/v1/sessions")
      .send({ userName: "player", password: "password" });

    expect(response.status).toBe(500);
    expect(response.type).toBe("application/problem+json");
    const requestId = response.get("X-Request-Id");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(response.text)).toEqual({
      type: "/problems/unexpected",
      title: "An unexpected error occurred",
      status: 500,
      detail: "An unexpected error occurred",
      requestId,
    });
    expect(response.text).not.toContain("database exploded");
    // The details are in the log, under the same request ID.
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: "error",
        reqId: requestId,
        err: expect.objectContaining({ message: "database exploded" }),
      })
    );
  });

  it("reports malformed JSON as a 400 with the parser's message", async () => {
    const response = await request(createApp())
      .post("/api/v1/sessions")
      .set("Content-Type", "application/json")
      .send('{"userName": ');

    expect(response.status).toBe(400);
    const body = JSON.parse(response.text);
    expect(body).toMatchObject({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
    });
    expect(body.detail).toMatch(/JSON/);
  });
});

describe("errorHandler", () => {
  function createRequest(originalUrl: string): Request {
    return { method: "GET", originalUrl } as Request;
  }

  it("responds with the error page outside the API", () => {
    const res = createMockResponse();
    res.type = vi.fn(() => res);
    // The shared mock parses bodies as JSON; this one is HTML.
    res.send = vi.fn(() => res);

    errorHandler(new Error("boom"), createRequest("/quest/q1"), res, vi.fn());

    expect(res.statusCode).toBe(500);
    expect(res.type).toHaveBeenCalledWith("html");
    const page = vi.mocked(res.send).mock.calls[0]?.[0] as string;
    expect(page).toContain("<h1>Internal Server Error</h1>");
    expect(page).toContain("<p>An unexpected error occurred</p>");
    expect(page).not.toContain("boom");
  });

  it("hides the message of a client error that is not meant to be shown", () => {
    const res = createMockResponse();
    const err = Object.assign(new Error("internal detail"), { status: 404 });

    errorHandler(err, createRequest("/api/v1/quests/q1"), res, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(res.type).toHaveBeenCalledWith("application/problem+json");
    expect(res.body).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "An unexpected error occurred",
    });
  });

  it("passes the error on when the response has already started", () => {
    const res = createMockResponse();
    res.headersSent = true;
    const next = vi.fn();
    const err = new Error("late");

    errorHandler(err, createRequest("/api/v1/sessions"), res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.send).not.toHaveBeenCalled();
  });
});
