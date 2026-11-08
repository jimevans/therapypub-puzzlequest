// Making the first administrator (src/admin/cli.ts), and filling a
// development database with sample data (scripts/seed.ts).
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const { config } = await import("../src/config.js");
const { run } = await import("../src/admin/cli.js");
const { seed } = await import("../scripts/seed.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../src/models/user.model.js");
const { PuzzleModel } = await import("../src/models/puzzle.model.js");
const { QuestModel, QuestPuzzleStatus, QuestStatus } =
  await import("../src/models/quest.model.js");
const { SessionModel } = await import("../src/models/session.model.js");
const { puzzleDataDirectory } = await import("../src/paths.js");

let mongoServer: MongoMemoryServer;
const environment = config.PQ_RUNTIME_ENVIRONMENT;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  config.PQ_MONGODB_URI = mongoServer.getUri("puzzlequest");
  await mongoose.connect(config.PQ_MONGODB_URI);
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.db!.dropDatabase();
});

describe("the promote command", () => {
  /**
   * Runs the command, which closes its connection, and connects again.
   * @param args the command line
   * @returns the exit code
   */
  async function promote(...args: string[]) {
    try {
      return await run(args);
    } finally {
      await mongoose.connect(config.PQ_MONGODB_URI);
    }
  }

  beforeEach(async () => {
    const user = await UserModel.create({
      userName: "pat",
      displayName: "Pat",
      email: "pat@example.com",
      password: "hashed",
      authorizationLevel: AuthorizationLevel.USER,
    });
    await SessionModel.create({
      userId: user._id,
      tokenHash: "a-hash",
      createdAt: new Date(),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
    });
  });

  it("makes a user an administrator, signing them out", async () => {
    expect(await promote("promote", "Pat")).toBe(0);

    const user = await UserModel.findOne({ userName: "pat" }).lean();
    expect(user!.authorizationLevel).toBe(AuthorizationLevel.ADMIN);
    expect(await SessionModel.countDocuments()).toBe(0);
  });

  it("leaves an administrator as they are", async () => {
    await promote("promote", "pat");

    expect(await promote("promote", "pat")).toBe(0);
  });

  it("says so when there's no such user", async () => {
    expect(await promote("promote", "nobody")).toBe(1);
  });

  it("explains itself when used wrongly", async () => {
    expect(await run(["promote"])).toBe(2);
    expect(await run(["demote", "pat"])).toBe(2);
  });
});

describe("the sample data", () => {
  beforeEach(() => {
    config.PQ_RUNTIME_ENVIRONMENT = "development";
  });

  afterEach(async () => {
    config.PQ_RUNTIME_ENVIRONMENT = environment;
    for (const file of ["seed-skyline.png", "seed-chime.wav"]) {
      await rm(path.join(puzzleDataDirectory, file), { force: true });
    }
  });

  it("is only for development", async () => {
    config.PQ_RUNTIME_ENVIRONMENT = "production";

    await expect(seed(false)).rejects.toThrow(
      "Seeding runs only with PQ_RUNTIME_ENVIRONMENT=development"
    );
    expect(await UserModel.countDocuments()).toBe(0);
  });

  it("has people of every role, and a team", async () => {
    await seed(false);

    const levels = Object.fromEntries(
      (await UserModel.find().lean()).map((user) => [
        user.userName,
        user.authorizationLevel,
      ])
    );
    expect(levels).toEqual({
      admin: AuthorizationLevel.ADMIN,
      helper: AuthorizationLevel.STAFF,
      alex: AuthorizationLevel.USER,
      blake: AuthorizationLevel.USER,
      casey: AuthorizationLevel.USER,
      drew: AuthorizationLevel.USER,
    });
    const team = await TeamModel.findOne({ teamName: "reds" }).lean();
    expect(team!.memberIds).toHaveLength(2);
  });

  it("has puzzles of every kind, with their media", async () => {
    await seed(false);

    expect(
      (await PuzzleModel.find().sort({ name: 1 }).lean()).map(
        (puzzle) => `${puzzle.name} ${puzzle.type}`
      )
    ).toEqual(["chime 2", "keys 0", "lighthouse 0", "skyline 1"]);
    const picture = await readFile(
      path.join(puzzleDataDirectory, "seed-skyline.png")
    );
    expect(picture.subarray(1, 4).toString()).toBe("PNG");
    const sound = await readFile(
      path.join(puzzleDataDirectory, "seed-chime.wav")
    );
    expect(sound.subarray(8, 12).toString()).toBe("WAVE");
  });

  it("has quests in every state", async () => {
    await seed(false);

    const quests = Object.fromEntries(
      (await QuestModel.find().lean()).map((quest) => [quest.name, quest])
    );
    expect(quests["old-town"].status).toBe(QuestStatus.NOT_STARTED);
    expect(quests["first-steps"].status).toBe(QuestStatus.COMPLETED);
    expect(quests["museum-mile"].pauses.at(-1)?.endTime).toBeFalsy();
    const harbor = quests["harbor-walk"];
    expect(harbor.status).toBe(QuestStatus.IN_PROGRESS);
    expect(harbor.puzzles.map((puzzle) => puzzle.status)).toEqual([
      QuestPuzzleStatus.COMPLETED,
      QuestPuzzleStatus.IN_PROGRESS,
      QuestPuzzleStatus.UNAVAILABLE,
    ]);
    expect(harbor.puzzles[1].nextHintToDisplay).toBe(1);
  });

  it("won't fill a database that has data, unless told to reset it", async () => {
    await seed(false);

    await expect(seed(false)).rejects.toThrow("npm run seed -- --reset");
    await seed(true);
    expect(await UserModel.countDocuments()).toBe(6);
  });
});
