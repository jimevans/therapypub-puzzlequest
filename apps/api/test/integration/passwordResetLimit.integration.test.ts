// Limits on password resets, which a venue full of players on one network
// address must be able to use: asking for links is limited by account and,
// generously, by address; failed resets by address, with successes free.
import type { Express } from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/email.service.js", () => ({
  sendEmail: vi.fn(async () => ({ status: "success", statusCode: 200 })),
}));

const { config } = await import("../../src/config.js");
const { createApp } = await import("../../src/createApp.js");
const { UserModel } = await import("../../src/models/user.model.js");
const EmailService = await import("../../src/services/email.service.js");
const PasswordService = await import("../../src/services/password.service.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  // Each test comes from its own network address, as production sees them
  // behind its proxy, so their counts don't mix.
  config.PQ_TRUST_PROXY = 1;
  config.PQ_BASE_URL = "https://puzzlequest.example";
  app = createApp();
  await UserModel.create(
    ["flooded", "neighbor", "resetter"].map((userName) => ({
      userName,
      displayName: userName,
      email: `${userName}@example.com`,
      password: "old-hash",
      authorizationLevel: 1,
      emailVerifiedAt: new Date(),
    }))
  );
}, 120000);

afterAll(async () => {
  config.PQ_TRUST_PROXY = undefined;
  await mongoose.disconnect();
  await mongoServer?.stop();
});

function askForLink(address: string, identifier: string) {
  return request(app)
    .post("/api/v1/password-reset-requests")
    .set("X-Forwarded-For", address)
    .send({ identifier });
}

function reset(address: string, resetToken: string) {
  return request(app)
    .post("/api/v1/password-resets")
    .set("X-Forwarded-For", address)
    .send({ resetToken, newPassword: "a new long enough password" });
}

/** Asks for a reset link through the service, and returns its token. */
async function emailedToken(userName: string): Promise<string> {
  vi.mocked(EmailService.sendEmail).mockClear();
  await PasswordService.requestPasswordReset(userName);
  const { text } = vi.mocked(EmailService.sendEmail).mock.calls[0][0];
  return new URL(text.match(/https:\/\/\S+/)![0]).searchParams.get("token")!;
}

describe("asking for a reset link", () => {
  it("allows three an hour for one account, from anywhere, however it's typed", async () => {
    expect((await askForLink("203.0.113.1", "flooded")).status).toBe(202);
    expect((await askForLink("203.0.113.2", " FLOODED ")).status).toBe(202);
    expect((await askForLink("203.0.113.3", "Flooded")).status).toBe(202);

    const stopped = await askForLink("203.0.113.4", "flooded");
    expect(stopped.status).toBe(429);
    expect(JSON.parse(stopped.text)).toMatchObject({
      type: "/problems/too-many-requests",
    });

    // Someone else on the same network still gets theirs.
    expect((await askForLink("203.0.113.4", "neighbor")).status).toBe(202);
  });

  it("allows fifty from one address, across accounts", async () => {
    for (let n = 0; n < 50; n++) {
      expect((await askForLink("198.51.100.1", `player-${n}`)).status).toBe(
        202
      );
    }

    expect((await askForLink("198.51.100.1", "player-50")).status).toBe(429);
    expect((await askForLink("198.51.100.2", "player-50")).status).toBe(202);
  });
});

describe("resetting with a link", () => {
  it("counts only failures, thirty from an address", async () => {
    const address = "192.0.2.1";
    for (let n = 0; n < 29; n++) {
      expect((await reset(address, "not a real token")).status).toBe(422);
    }

    // A success doesn't count, or the next failure would be the 31st.
    expect((await reset(address, await emailedToken("resetter"))).status).toBe(
      204
    );
    expect((await reset(address, "not a real token")).status).toBe(422);

    expect((await reset(address, "not a real token")).status).toBe(429);
    expect((await reset("192.0.2.2", "not a real token")).status).toBe(422);
  });
});
