// Checks that MongoDB builds the indexes the common lookups rely on.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { type Model } from "mongoose";

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
    ["quests", QuestModel, { userName: 1 }],
    ["teams", TeamModel, { memberNames: 1 }],
    ["users", UserModel, { phone: 1 }],
    ["questEvents", QuestEventModel, { questName: 1, at: 1 }],
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
