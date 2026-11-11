// Tests of what staff see through the v1 API: every quest, and every stop of
// one in order, but nothing that would tell them how to solve a puzzle. These
// check the raw answers for anything that mustn't be there.
import type { Express } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { assigneeIdsOf, entryIdOf, userIdsOf } from "../references.js";
import { startSessions } from "../sessions.js";

const { createApp } = await import("../../src/createApp.js");
const { staffQuestSchema, staffQuestSummarySchema } =
  await import("../../src/api/v1/resources.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");
const { SessionModel } = await import("../../src/models/session.model.js");
const QuestService = await import("../../src/services/quest.service.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let sessions: Record<string, string> = {};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = createApp();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    TeamModel.deleteMany({}),
    PuzzleModel.deleteMany({}),
    QuestModel.deleteMany({}),
    SessionModel.deleteMany({}),
  ]);
  await UserModel.create([
    {
      userName: "player",
      displayName: "Player Person",
      email: "player@example.com",
      password: "hash",
    },
    {
      userName: "helper",
      displayName: "Helper",
      email: "helper@example.com",
      password: "hash",
      authorizationLevel: AuthorizationLevel.STAFF,
    },
  ]);
  await TeamModel.create({
    teamName: "the-team",
    displayName: "Team Display",
    joinCode: "join-code",
    memberIds: await userIdsOf("player"),
  });
  await PuzzleModel.create([
    {
      name: "riddle",
      displayName: "Riddle",
      text: "What has **keys**?",
      solutionKeyword: "pianokeyword",
      solutionDisplayText: "A piano",
      hints: [
        { text: "It makes music", timePenalty: 60 },
        { text: "Unrevealed hint", solutionWarning: true, timePenalty: 300 },
      ],
    },
    {
      name: "lantern",
      displayName: "Lantern",
      text: "Lantern text",
      solutionKeyword: "lanternkeyword",
      solutionDisplayText: "Lantern solution",
    },
  ]);
  await QuestService.createQuest({
    name: "quest",
    displayName: "Quest",
    entrants: [{ kind: "team", name: "the-team" }],
    puzzles: [
      { puzzleName: "riddle", activationCode: "riddle-code" },
      { puzzleName: "lantern", activationCode: "lantern-code" },
    ],
  });
  await QuestService.startQuest("quest");
  await QuestModel.updateOne(
    { name: "quest" },
    {
      "entries.0.puzzles.0.status": 3,
      "entries.0.puzzles.0.activationTime": new Date(),
      "entries.0.puzzles.0.endTime": new Date(),
      "entries.0.puzzles.0.nextHintToDisplay": 1,
      "entries.0.textResponse": "secret reply",
      "entries.0.textResponseConfirmation": "secret confirmation",
    }
  );
  sessions = await startSessions("helper", "player");
});

/**
 * What no staff answer may contain: anything that tells how to solve.
 * (Activation codes aren't: staff show them to the players at each stop.)
 */
const NEVER_SHOWN = [
  /solution/i,
  /keyword/,
  /A piano/,
  /It makes music/,
  /Unrevealed hint/,
  /What has/,
  /Lantern text/,
  /secret/,
  /textResponse/,
  /penaltyFreeHints/,
  /assignee/,
];

/**
 * Checks that a staff answer has nothing about how to solve, and no user's or
 * team's own ID.
 * @param text the answer
 */
async function expectNothingHidden(text: string) {
  for (const pattern of NEVER_SHOWN) {
    expect(text).not.toMatch(pattern);
  }
  const [teamId] = await assigneeIdsOf("the-team");
  expect(text).not.toContain(teamId);
}

function asStaff(path: string) {
  return request(app)
    .get(path)
    .set("Authorization", `Bearer ${sessions.helper}`);
}

describe("a quest, as staff see it", () => {
  it("shows every stop in order, reached or not, with its status", async () => {
    const response = await asStaff("/api/v1/quests/quest/staff-view");

    expect(response.status).toBe(200);
    expect(staffQuestSchema.parse(response.body)).toEqual(response.body);
    expect(response.body).toMatchObject({
      name: "quest",
      displayName: "Quest",
    });
    expect(response.body.entries).toHaveLength(1);
    expect(response.body.entries[0]).toMatchObject({
      id: await entryIdOf("quest"),
      entrant: { kind: "team", name: "the-team", displayName: "Team Display" },
      status: 1,
      paused: false,
      puzzles: [
        {
          name: "riddle",
          displayName: "Riddle",
          status: 3,
          statusDescription: "Completed",
          activationCode: "riddle-code",
          hintsRevealed: 1,
          hintCount: 2,
        },
        {
          name: "lantern",
          displayName: "Lantern",
          status: 0,
          statusDescription: "Unavailable",
          activationCode: "lantern-code",
          hintsRevealed: 0,
          hintCount: 0,
        },
      ],
    });
    expect(response.body.entries[0].puzzles[0].endTime).toEqual(
      expect.any(String)
    );
  });

  it("tells nothing about how to solve it", async () => {
    const response = await asStaff("/api/v1/quests/quest/staff-view");

    await expectNothingHidden(response.text);
  });

  it("is a problem for a quest that doesn't exist", async () => {
    const response = await asStaff("/api/v1/quests/nothing/staff-view");

    expect(response.status).toBe(404);
  });

  it("isn't for players, even the quest's own", async () => {
    const response = await request(app)
      .get("/api/v1/quests/quest/staff-view")
      .set("Authorization", `Bearer ${sessions.player}`);

    expect(response.status).toBe(403);
  });
});

describe("the quests, as staff see them", () => {
  it("lists each with who it's for and how it's going", async () => {
    const response = await asStaff("/api/v1/staff/quests");

    expect(response.status).toBe(200);
    expect(response.body.next).toBeNull();
    expect(response.body.items).toHaveLength(1);
    const [quest] = response.body.items;
    expect(staffQuestSummarySchema.parse(quest)).toEqual(quest);
    expect(quest).toMatchObject({
      name: "quest",
      entries: [
        {
          entrant: { kind: "team", name: "the-team" },
          statusDescription: "In progress",
        },
      ],
    });
    await expectNothingHidden(response.text);
    for (const pattern of [/activationCode/, /-code/, /riddle/i, /lantern/i]) {
      expect(response.text).not.toMatch(pattern);
    }
  });
});

describe("a quest several teams race, as staff see it", () => {
  beforeEach(async () => {
    await TeamModel.create({
      teamName: "rivals",
      displayName: "Rival Crew",
      joinCode: "rival-code",
      memberIds: [],
    });
    await QuestService.updateQuest({
      name: "quest",
      entrants: [
        { kind: "team", name: "the-team" },
        { kind: "team", name: "rivals" },
      ],
    });
  });

  it("shows every entry, each with every stop and its own progress", async () => {
    const response = await asStaff("/api/v1/quests/quest/staff-view");

    expect(response.status).toBe(200);
    const status = (entry: { puzzles: { status: number }[] }) =>
      entry.puzzles.map((puzzle) => puzzle.status);
    const [leaders, rivals] = response.body.entries;
    expect(leaders.entrant.name).toBe("the-team");
    expect(status(leaders)).toEqual([3, 0]);
    expect(rivals).toMatchObject({
      id: await entryIdOf("quest", 1),
      entrant: { kind: "team", name: "rivals", displayName: "Rival Crew" },
      status: 0,
      statusDescription: "Not yet started",
    });
    expect(status(rivals)).toEqual([0, 0]);
    expect(
      rivals.puzzles.map((p: { activationCode: string }) => p.activationCode)
    ).toEqual(["riddle-code", "lantern-code"]);
    await expectNothingHidden(response.text);
  });

  it("lists every entry with how it's going", async () => {
    const response = await asStaff("/api/v1/staff/quests");

    expect(
      response.body.items[0].entries.map(
        (entry: { entrant: { name: string }; status: number }) => [
          entry.entrant.name,
          entry.status,
        ]
      )
    ).toEqual([
      ["the-team", 1],
      ["rivals", 0],
    ]);
  });

  it("ranks the entries that have finished, keeping them in the quest's order", async () => {
    await QuestService.startQuest(
      "quest",
      {},
      { entrant: { kind: "team", name: "rivals" } }
    );
    for (const puzzleName of ["riddle", "lantern"]) {
      await QuestService.skipQuestPuzzle(
        "quest",
        puzzleName,
        {},
        { entrant: { kind: "team", name: "rivals" } }
      );
    }
    const ranks = (body: {
      entries: { entrant: { name: string }; rank: number | null }[];
    }) => body.entries.map(({ entrant, rank }) => [entrant.name, rank]);

    const quest = await asStaff("/api/v1/quests/quest/staff-view");
    const list = await asStaff("/api/v1/staff/quests");

    expect(ranks(quest.body)).toEqual([
      ["the-team", null],
      ["rivals", 1],
    ]);
    expect(ranks(list.body.items[0])).toEqual([
      ["the-team", null],
      ["rivals", 1],
    ]);
  });
});
