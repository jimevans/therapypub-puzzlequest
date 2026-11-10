// Checks that MongoDB builds the indexes the common lookups rely on.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { type Model } from "mongoose";

const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { QuestEventModel } =
  await import("../../src/models/questEvent.model.js");
const { TeamModel, UserModel } = await import("../../src/models/user.model.js");

let mongoServer: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

describe("indexes", () => {
  it.each([
    ["quests", QuestModel, { "entries.assignee.id": 1 }],
    ["quests", QuestModel, { "puzzles.puzzleId": 1 }],
    ["teams", TeamModel, { memberIds: 1 }],
    ["users", UserModel, { phone: 1 }],
    ["questEvents", QuestEventModel, { questName: 1, at: 1 }],
    ["users", UserModel, { organizationId: 1, userName: 1 }],
    ["users", UserModel, { organizationId: 1, email: 1 }],
    ["teams", TeamModel, { organizationId: 1, teamName: 1 }],
    ["teams", TeamModel, { organizationId: 1, joinCode: 1 }],
    ["puzzles", PuzzleModel, { organizationId: 1, name: 1 }],
    ["quests", QuestModel, { organizationId: 1, name: 1 }],
  ] as [string, Model<any>, Record<string, number>][])(
    "are built on %s",
    async (_, model, key) => {
      // init() waits for the indexes Mongoose builds on startup.
      await model.init();

      const indexes = await model.collection.indexes();

      expect(indexes.map((index) => index.key)).toContainEqual(key);
    }
  );
});

describe("names", () => {
  it.each([
    ["users", UserModel, ["userName", "email"]],
    ["teams", TeamModel, ["teamName", "joinCode"]],
    ["puzzles", PuzzleModel, ["name"]],
    ["quests", QuestModel, ["name"]],
  ] as [string, Model<any>, string[]][])(
    "on %s are unique only within an organization",
    async (_, model, fields) => {
      await model.init();

      const indexes = await model.collection.indexes();

      for (const field of fields) {
        expect(indexes).not.toContainEqual(
          expect.objectContaining({ key: { [field]: 1 }, unique: true })
        );
        expect(indexes).toContainEqual(
          expect.objectContaining({
            key: { organizationId: 1, [field]: 1 },
            unique: true,
          })
        );
      }
    }
  );
});
