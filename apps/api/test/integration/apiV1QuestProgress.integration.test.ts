// The times the API reports, which the player's and spectators' screens show
// as they are: elapsed time, hint penalties, and their total.
import type { Express } from "express";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { puzzleIdsOf, userIdsOf } from "../references.js";
import { startSessions } from "../sessions.js";

const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");

const MINUTE = 60 * 1000;

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let sessions: Record<string, string> = {};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = createApp();
  await UserModel.create({
    userName: "player",
    displayName: "Player",
    email: "player@example.com",
    password: "hash",
    authorizationLevel: AuthorizationLevel.USER,
  });
  await PuzzleModel.create([
    {
      name: "first",
      displayName: "First",
      solutionKeyword: "one",
      solutionDisplayText: "One",
      hints: [{ text: "A hint", timePenalty: 60 }],
    },
    {
      name: "second",
      displayName: "Second",
      solutionKeyword: "two",
      solutionDisplayText: "Two",
    },
  ]);
  const [firstId, secondId] = await puzzleIdsOf("first", "second");
  const [playerId] = await userIdsOf("player");
  // 45 minutes, with one revealed 60-second hint.
  await QuestModel.create({
    name: "finished",
    displayName: "Finished",
    puzzles: [
      { puzzleId: firstId, activationCode: "code1" },
      { puzzleId: secondId, activationCode: "code2" },
    ],
    entries: [
      {
        assignee: { kind: "user", id: playerId },
        status: 2,
        puzzles: [
          {
            puzzleId: firstId,
            status: 3,
            nextHintToDisplay: 1,
            startTime: new Date("2026-11-03T19:00:00Z"),
            activationTime: new Date("2026-11-03T19:05:00Z"),
            endTime: new Date("2026-11-03T19:30:00Z"),
          },
          {
            puzzleId: secondId,
            status: 3,
            nextHintToDisplay: 0,
            startTime: new Date("2026-11-03T19:30:00Z"),
            activationTime: new Date("2026-11-03T19:35:00Z"),
            endTime: new Date("2026-11-03T19:45:00Z"),
          },
        ],
      },
    ],
  });
  sessions = await startSessions("player");
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

const EXPECTED = {
  running: false,
  elapsedMs: 45 * MINUTE,
  penaltyMs: MINUTE,
  totalMs: 46 * MINUTE,
};

describe("a finished quest's times", () => {
  it("are in the player's view of the quest", async () => {
    const response = await request(app)
      .get("/api/v1/quests/finished")
      .set("Authorization", `Bearer ${sessions.player}`);

    expect(response.body.progress).toMatchObject(EXPECTED);
    expect(response.body.progress.puzzles[0]).toMatchObject({
      puzzleName: "first",
      penaltyMs: MINUTE,
    });
  });

  it("are in the player's list of quests", async () => {
    const response = await request(app)
      .get("/api/v1/users/player/quests")
      .set("Authorization", `Bearer ${sessions.player}`);

    expect(response.body.items[0].progress).toMatchObject(EXPECTED);
  });

  it("are in the public view of the quest", async () => {
    const response = await request(app).get(
      "/api/v1/quests/finished/spectator-view"
    );

    expect(response.body.progress).toMatchObject(EXPECTED);
    expect(response.body.progress.puzzles[0]).toMatchObject({
      puzzleName: "first",
      penaltyMs: MINUTE,
    });
  });
});
