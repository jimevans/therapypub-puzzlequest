// Limits on guessing at a current password, which go by user: players at a venue
// share a network address, and one player's mistakes mustn't lock out the others.
import bcrypt from "bcrypt";
import type { Express } from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startSessions } from "../sessions.js";

const { createApp } = await import("../../src/createApp.js");
const CURRENT = "the current password";
const WRONG = "a wrong guess";
const LIMIT = 5;

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let sessions: Record<string, string> = {};

beforeAll(async () => {
  // The tests' stand-in for bcrypt (see setup.ts) refuses every password.
  vi.mocked(bcrypt.compare).mockImplementation(
    (async (guess: string) => guess !== WRONG) as never
  );
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = createApp();
  for (const userName of ["careless", "careful", "changer"]) {
    await request(app)
      .post("/api/v1/users")
      .send({
        userName,
        email: `${userName}@example.com`,
        password: CURRENT,
      })
      .expect(201);
  }
  sessions = await startSessions("careless", "careful", "changer");
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

function change(
  userName: string,
  currentPassword: string,
  newPassword: string
) {
  return request(app)
    .put(`/api/v1/users/${userName}/password`)
    .set("Authorization", `Bearer ${sessions[userName]}`)
    .send({ currentPassword, newPassword });
}

describe("changing a password", () => {
  it("stops a user who keeps guessing, but nobody else on the network", async () => {
    for (let attempt = 0; attempt < LIMIT; attempt++) {
      const wrong = await change("careless", WRONG, "a new password");
      expect(wrong.status).toBe(422);
    }

    const stopped = await change("careless", CURRENT, "a new password");
    expect(stopped.status).toBe(429);

    const other = await change("careful", CURRENT, "a new password");
    expect(other.status).toBe(204);
  });

  it("doesn't count changes that work", async () => {
    let current = CURRENT;
    for (let attempt = 0; attempt <= LIMIT; attempt++) {
      const next = `a new password, number ${attempt}`;
      expect((await change("changer", current, next)).status).toBe(204);
      current = next;
    }
  });
});
