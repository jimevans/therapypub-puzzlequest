// Limits on trying join codes. A player joins a team by its code alone, so any
// team's code works, and trying codes until one does must be stopped. Like the
// other limits on guessing, it goes by user, since players at a venue share a
// network address.
import type { Express } from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSessions } from "../sessions.js";

const { createApp } = await import("../../src/createApp.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");
const LIMIT = 10;

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let sessions: Record<string, string> = {};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = createApp();
  await UserModel.create(
    ["boss", "guesser", "neighbour", "joiner"].map((userName) => ({
      userName,
      displayName: userName,
      email: `${userName}@example.com`,
      password: "hash",
      authorizationLevel:
        userName === "boss"
          ? AuthorizationLevel.ADMIN
          : AuthorizationLevel.USER,
    }))
  );
  sessions = await startSessions("boss", "guesser", "neighbour", "joiner");
  for (let index = 0; index <= LIMIT; index++) {
    await request(app)
      .post("/api/v1/teams")
      .set("Authorization", `Bearer ${sessions.boss}`)
      .send({
        teamName: `team-${index}`,
        displayName: `Team ${index}`,
        joinCode: `code-${index}`,
      })
      .expect(201);
  }
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

function join(userName: string, joinCode: string) {
  return request(app)
    .post(`/api/v1/users/${userName}/teams`)
    .set("Authorization", `Bearer ${sessions[userName]}`)
    .send({ joinCode });
}

describe("joining a team by its code", () => {
  it("stops a user who keeps trying codes, but nobody else on the network", async () => {
    for (let attempt = 0; attempt < LIMIT; attempt++) {
      expect((await join("guesser", `guess-${attempt}`)).status).toBe(422);
    }

    expect((await join("guesser", "code-0")).status).toBe(429);
    expect((await join("neighbour", "code-0")).status).toBe(201);
  });

  it("doesn't count codes that work", async () => {
    for (let index = 0; index <= LIMIT; index++) {
      expect((await join("joiner", `code-${index}`)).status).toBe(201);
    }
  });
});
