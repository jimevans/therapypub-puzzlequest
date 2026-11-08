// What the server logs: each request with its ID, nothing personal, and the
// security events worth noticing.
import mongoose from "mongoose";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/createApp.js";
import { log, logger } from "../src/logger.js";
import { recordLogs } from "./logs.js";

describe("the log", () => {
  it("keeps private fields out, wherever they are", () => {
    const logs = recordLogs();

    logger.info(
      {
        password: "hunter22",
        user: { email: "pat@example.com", phone: "+13125550142", id: "7" },
        headers: { authorization: "Bearer abc", cookie: "pq-session=xyz" },
        err: { message: "E11000", keyValue: { email: "pat@example.com" } },
      },
      "something happened"
    );

    const written = JSON.stringify(logs);
    for (const secret of [
      "hunter22",
      "pat@example.com",
      "+13125550142",
      "Bearer abc",
      "pq-session=xyz",
    ]) {
      expect(written).not.toContain(secret);
    }
    expect(logs[0]).toMatchObject({ user: { id: "7" } });
  });

  it("is the server's outside a request", () => {
    expect(log()).toBe(logger);
  });
});

describe("requests", () => {
  it("each get an ID, sent back, and logged when they finish, without their query", async () => {
    const logs = recordLogs();

    const response = await request(createApp()).get(
      "/api/v1/sessions/current?token=secret-token"
    );

    const requestId = response.get("X-Request-Id");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: "info",
        msg: "request completed",
        req: { id: requestId, method: "GET", path: "/api/v1/sessions/current" },
        res: { statusCode: 401 },
        responseTime: expect.any(Number),
      })
    );
    expect(JSON.stringify(logs)).not.toContain("secret-token");
  });

  it("make a fresh ID each, whatever the client sends", async () => {
    const response = await request(createApp())
      .get("/api/v1/sessions/current")
      .set("X-Request-Id", "made-up");

    expect(response.get("X-Request-Id")).not.toBe("made-up");
  });

  it("for built files and the health check aren't logged", async () => {
    const logs = recordLogs();
    const app = createApp();

    await request(app).get("/style/error.css");
    await request(app).get("/healthz");

    expect(logs.filter((entry) => entry.msg === "request completed")).toEqual(
      []
    );
  });
});

describe("the health check", () => {
  it("is unavailable without the database, and never cached", async () => {
    const response = await request(createApp()).get("/healthz");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "unavailable" });
    expect(response.get("Cache-Control")).toBe("no-store");
  });

  it("is ok while the database is connected", async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(
      mongoose.ConnectionStates.connected
    );

    const response = await request(createApp()).get("/healthz");

    vi.restoreAllMocks();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

describe("security events", () => {
  it("note a request refused as coming from another site", async () => {
    const logs = recordLogs();

    await request(createApp())
      .delete("/api/v1/sessions/current")
      .set("Origin", "https://elsewhere.example");

    expect(logs).toContainEqual(
      expect.objectContaining({
        level: "warn",
        event: "cross-site-request-refused",
        origin: "https://elsewhere.example",
      })
    );
  });
});
