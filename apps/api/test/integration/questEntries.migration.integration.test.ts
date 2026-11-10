// Moving quests stored before entries into the new shape: each quest's
// assignee and progress become its one entry, and the quest keeps its stops.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";

const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { UserModel } = await import("../../src/models/user.model.js");
const { moveQuestProgressIntoEntries } =
  await import("../../src/models/questEntries.migration.js");
const QuestService = await import("../../src/services/quest.service.js");

let mongoServer: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

const started = new Date("2026-11-01T10:00:00Z");
const activated = new Date("2026-11-01T10:05:00Z");
const solved = new Date("2026-11-01T10:20:00Z");
let playerId: Types.ObjectId;
let puzzleIds: Types.ObjectId[];

beforeEach(async () => {
  await Promise.all([
    QuestModel.collection.deleteMany({}),
    PuzzleModel.deleteMany({}),
    UserModel.deleteMany({}),
  ]);
  const player = await UserModel.create({
    userName: "player",
    displayName: "Player",
    email: "player@example.com",
    password: "hash",
  });
  playerId = player._id;
  const puzzles = await PuzzleModel.create(
    ["first", "second"].map((name) => ({
      name,
      displayName: name.toUpperCase(),
      solutionKeyword: name,
      solutionDisplayText: name,
    }))
  );
  puzzleIds = puzzles.map((puzzle) => puzzle._id);
  // A quest as stored before entries, partway through.
  await QuestModel.collection.insertOne({
    name: "old",
    displayName: "Old Quest",
    visibility: "private",
    assignee: { kind: "user", id: playerId },
    status: 1,
    textResponse: "ready",
    textResponseConfirmation: "Go!",
    pauses: [{ startTime: activated, endTime: solved }],
    puzzles: [
      {
        _id: new Types.ObjectId(),
        puzzleId: puzzleIds[0],
        activationCode: "code-1",
        cardWord: "SHOW",
        nextHintToDisplay: 1,
        status: 3,
        startTime: started,
        activationTime: activated,
        endTime: solved,
        skipped: false,
        penaltyFreeHints: 1,
      },
      {
        _id: new Types.ObjectId(),
        puzzleId: puzzleIds[1],
        activationCode: "code-2",
        nextHintToDisplay: 0,
        status: 1,
        startTime: solved,
        skipped: false,
        penaltyFreeHints: 0,
      },
    ],
    __v: 4,
  });
});

describe("moving quests' progress into entries", () => {
  it("makes the assignee and progress the quest's one entry", async () => {
    expect(await moveQuestProgressIntoEntries()).toBe(1);

    const stored = await QuestModel.collection.findOne({ name: "old" });
    expect(stored).not.toHaveProperty("assignee");
    expect(stored).not.toHaveProperty("status");
    expect(stored).not.toHaveProperty("pauses");
    expect(stored).not.toHaveProperty("textResponse");
    expect(stored!.__v).toBe(5);
    expect(stored!.puzzles).toEqual([
      {
        _id: expect.any(Types.ObjectId),
        puzzleId: puzzleIds[0],
        activationCode: "code-1",
        cardWord: "SHOW",
      },
      {
        _id: expect.any(Types.ObjectId),
        puzzleId: puzzleIds[1],
        activationCode: "code-2",
      },
    ]);
    expect(stored!.entries).toEqual([
      {
        _id: expect.any(Types.ObjectId),
        assignee: { kind: "user", id: playerId },
        status: 1,
        textResponse: "ready",
        textResponseConfirmation: "Go!",
        pauses: [{ startTime: activated, endTime: solved }],
        puzzles: [
          {
            puzzleId: puzzleIds[0],
            nextHintToDisplay: 1,
            status: 3,
            startTime: started,
            activationTime: activated,
            endTime: solved,
            skipped: false,
            penaltyFreeHints: 1,
          },
          {
            puzzleId: puzzleIds[1],
            nextHintToDisplay: 0,
            status: 1,
            startTime: solved,
            skipped: false,
            penaltyFreeHints: 0,
          },
        ],
      },
    ]);
  });

  it("leaves the quest as the service sees it unchanged", async () => {
    await moveQuestProgressIntoEntries();

    const found = await QuestService.getQuestByQuestName("old");

    expect(found.status).toBe("success");
    const quest = found.data!;
    expect(quest).toMatchObject({
      name: "old",
      displayName: "Old Quest",
      visibility: "private",
      assignee: { kind: "user", id: playerId.toString(), name: "player" },
      status: 1,
      textResponse: "ready",
      pauses: [{ startTime: activated, endTime: solved }],
    });
    expect(
      quest.puzzles.map(({ puzzleName, status, activationCode }) => ({
        puzzleName,
        status,
        activationCode,
      }))
    ).toEqual([
      { puzzleName: "first", status: 3, activationCode: "code-1" },
      { puzzleName: "second", status: 1, activationCode: "code-2" },
    ]);
    expect(quest.puzzles[0]).toMatchObject({
      cardWord: "SHOW",
      nextHintToDisplay: 1,
      activationTime: activated,
      endTime: solved,
      penaltyFreeHints: 1,
    });
  });

  it("does nothing the second time", async () => {
    await moveQuestProgressIntoEntries();
    const once = await QuestModel.collection.findOne({ name: "old" });

    expect(await moveQuestProgressIntoEntries()).toBe(0);
    expect(await QuestModel.collection.findOne({ name: "old" })).toEqual(once);
  });

  it("drops the index on the old assignee field", async () => {
    await QuestModel.collection.createIndex({ "assignee.id": 1 });

    await moveQuestProgressIntoEntries();

    const indexes = await QuestModel.collection.indexes();
    expect(indexes.map((index) => index.name)).not.toContain("assignee.id_1");
  });
});
