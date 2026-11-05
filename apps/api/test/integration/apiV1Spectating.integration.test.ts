// Tests of following a quest from outside it, through the v1 API and the
// monitor pages. Anyone can do this, players included, so these check the raw
// answers: nothing may show what a player couldn't see, or how long a quest is.
import type { Express } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { userIdsOf } from "../references.js";

const { createApp } = await import("../../src/createApp.js");
const { spectatorPuzzleSchema, spectatorQuestSchema } =
  await import("../../src/api/v1/resources.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { TeamModel, UserModel } = await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;

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
  ]);
  await UserModel.create({
    userName: "player",
    displayName: "Player Person",
    email: "player@example.com",
    password: "hash",
  });
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
    {
      name: "finale",
      displayName: "Finale",
      text: "Finale text",
      solutionKeyword: "finalekeyword",
      solutionDisplayText: "Finale solution",
    },
  ]);
  await QuestService.createQuest({
    name: "quest",
    displayName: "Quest",
    assignee: { kind: "team", name: "the-team" },
    puzzles: [
      { puzzleName: "riddle", activationCode: "riddle-code" },
      { puzzleName: "lantern", activationCode: "lantern-code" },
      { puzzleName: "finale", activationCode: "finale-code" },
    ],
  });
  await QuestModel.updateOne(
    { name: "quest" },
    {
      textResponse: "secret reply",
      textResponseConfirmation: "secret confirmation",
    }
  );
});

/** Starts the quest, with its first puzzle activated and one hint revealed. */
async function startAndActivateFirst() {
  await QuestService.startQuest("quest");
  await QuestModel.updateOne(
    { name: "quest" },
    {
      "puzzles.0.status": 2,
      "puzzles.0.activationTime": new Date(),
      "puzzles.0.nextHintToDisplay": 1,
    }
  );
}

const QUEST = "/api/v1/quests/quest/spectator-view";
const puzzlePath = (puzzle: string) =>
  `/api/v1/quests/quest/puzzles/${puzzle}/spectator-view`;

/** What no public answer may ever contain, however far the quest has got. */
const ALWAYS_HIDDEN = [
  /assignee/i,
  /the-team/,
  /Team Display/,
  /Player Person/,
  /activationCode/,
  /-code/,
  /solutionKeyword/,
  /keyword/,
  /secret/,
  /textResponse/,
];

/** What no answer may contain while only the first puzzle has been reached. */
const UNREACHED = [/lantern/i, /finale/i];

function expectNoneOf(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    expect(text).not.toMatch(pattern);
  }
}

describe("following a quest", () => {
  async function seen() {
    const response = await request(app).get(QUEST);
    expect(response.status).toBe(200);
    const body = JSON.parse(response.text);
    expect(spectatorQuestSchema.parse(body)).toEqual(body);
    return { body, text: response.text };
  }

  it("shows a quest that hasn't started by name and status alone", async () => {
    const { body, text } = await seen();

    expect(body).toMatchObject({
      name: "quest",
      displayName: "Quest",
      status: 0,
      paused: false,
      puzzles: [],
      progress: { running: false, elapsedMs: 0, puzzles: [] },
    });
    expectNoneOf(text, [...ALWAYS_HIDDEN, ...UNREACHED, /riddle/i]);
  });

  it("shows only the puzzles reached, without their solutions", async () => {
    await startAndActivateFirst();

    const { body, text } = await seen();

    expect(body.puzzles).toEqual([
      {
        name: "riddle",
        displayName: "Riddle",
        status: 2,
        statusDescription: expect.any(String),
        skipped: false,
        activationTime: expect.any(String),
        solutionText: null,
      },
    ]);
    expect(body.progress.puzzles).toHaveLength(1);
    expectNoneOf(text, [...ALWAYS_HIDDEN, ...UNREACHED, /A piano/]);
  });

  it("names the next puzzle once it's reached, and shows the solution", async () => {
    await QuestService.startQuest("quest");
    await QuestService.skipQuestPuzzle("quest", "riddle");

    const { body, text } = await seen();

    expect(body.puzzles.map((p: { name: string }) => p.name)).toEqual([
      "riddle",
      "lantern",
    ]);
    expect(body.puzzles[0]).toMatchObject({
      skipped: true,
      solutionText: "A piano",
    });
    expect(body.puzzles[1].solutionText).toBeNull();
    expect(body.progress.puzzles).toHaveLength(2);
    expectNoneOf(text, [...ALWAYS_HIDDEN, /finale/i, /Lantern solution/]);
  });

  it("says when the quest is paused", async () => {
    await startAndActivateFirst();
    await QuestService.pauseQuest("quest");

    expect((await seen()).body.paused).toBe(true);
  });

  it("isn't found for a quest that doesn't exist", async () => {
    const response = await request(app).get(
      "/api/v1/quests/nothing/spectator-view"
    );

    expect(response.status).toBe(404);
    expect(JSON.parse(response.text).type).toBe("/problems/not-found");
  });
});

describe("following a puzzle", () => {
  it("shows what it asks and the hints revealed, once activated", async () => {
    await startAndActivateFirst();

    const response = await request(app).get(puzzlePath("riddle"));

    expect(response.status).toBe(200);
    const body = JSON.parse(response.text);
    expect(spectatorPuzzleSchema.parse(body)).toEqual(body);
    expect(body).toMatchObject({
      quest: { name: "quest", displayName: "Quest", paused: false },
      puzzle: {
        name: "riddle",
        displayName: "Riddle",
        status: 2,
        type: 0,
        text: "What has **keys**?",
        hints: [{ text: "It makes music", timePenalty: 60 }],
        solutionText: null,
      },
    });
    expectNoneOf(response.text, [
      ...ALWAYS_HIDDEN,
      ...UNREACHED,
      /Unrevealed hint/,
      /A piano/,
    ]);
  });

  it("shows the solution once solved", async () => {
    await QuestService.startQuest("quest");
    await QuestService.skipQuestPuzzle("quest", "riddle");

    const response = await request(app).get(puzzlePath("riddle"));

    expect(JSON.parse(response.text).puzzle).toMatchObject({
      status: 3,
      skipped: true,
      solutionText: "A piano",
    });
  });

  it("answers alike for a puzzle waiting, unreached, and nonexistent", async () => {
    await QuestService.startQuest("quest");
    const unknown = await request(app).get(puzzlePath("nothing"));
    expect(unknown.status).toBe(404);

    for (const puzzle of ["riddle", "lantern"]) {
      const response = await request(app).get(puzzlePath(puzzle));

      expect(response.status).toBe(404);
      expect(response.text.replaceAll(puzzle, "nothing")).toBe(unknown.text);
    }
  });
});

describe("the monitor pages", () => {
  it("don't put puzzles not yet reached anywhere in the page", async () => {
    await startAndActivateFirst();

    const page = await request(app).get("/monitor/quest/quest");

    expect(page.status).toBe(200);
    expect(page.text).toContain("Riddle");
    expectNoneOf(page.text, UNREACHED);
  });

  it("still show a quest that hasn't started", async () => {
    const page = await request(app).get("/monitor/quest/quest");

    expect(page.status).toBe(200);
    expect(page.text).toContain("No active puzzles yet");
  });

  it("answer alike for a puzzle waiting, unreached, and nonexistent", async () => {
    await QuestService.startQuest("quest");
    const path = (puzzle: string) => `/monitor/quest/quest/puzzle/${puzzle}`;
    const unknown = await request(app).get(path("nothing"));
    expect(unknown.status).toBe(404);

    for (const puzzle of ["riddle", "lantern"]) {
      const page = await request(app).get(path(puzzle));

      expect(page.status).toBe(404);
      expect(page.text.replaceAll(puzzle, "nothing")).toBe(unknown.text);
    }
  });

  it("show a puzzle once activated", async () => {
    await startAndActivateFirst();

    const page = await request(app).get("/monitor/quest/quest/puzzle/riddle");

    expect(page.status).toBe(200);
    expect(page.text).toContain("<strong>keys</strong>");
    expect(page.text).toContain("It makes music");
    expect(page.text).not.toContain("Unrevealed hint");
  });
});
