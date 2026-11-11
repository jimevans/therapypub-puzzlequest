// Tests of following a quest from outside it, through the v1 API. Anyone can do
// this, players included, so these check the raw
// answers: nothing may show what a player couldn't see, or how long a quest is.
import type { Express } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { entryIdOf, userIdsOf } from "../references.js";
import { startSessions } from "../sessions.js";

const { createApp } = await import("../../src/createApp.js");
const { spectatorPuzzleSchema, spectatorQuestSchema } =
  await import("../../src/api/v1/resources.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const { SessionModel } = await import("../../src/models/session.model.js");

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
    SessionModel.deleteMany({}),
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
    entrants: [{ kind: "team", name: "the-team" }],
    puzzles: [
      { puzzleName: "riddle", activationCode: "riddle-code" },
      { puzzleName: "lantern", activationCode: "lantern-code" },
      { puzzleName: "finale", activationCode: "finale-code" },
    ],
  });
  await QuestModel.updateOne(
    { name: "quest" },
    {
      "entries.0.textResponse": "secret reply",
      "entries.0.textResponseConfirmation": "secret confirmation",
    }
  );
});

/** Starts the quest, with its first puzzle activated and one hint revealed. */
async function startAndActivateFirst() {
  await QuestService.startQuest("quest");
  await QuestModel.updateOne(
    { name: "quest" },
    {
      "entries.0.puzzles.0.status": 2,
      "entries.0.puzzles.0.activationTime": new Date(),
      "entries.0.puzzles.0.nextHintToDisplay": 1,
    }
  );
}

const QUEST = "/api/v1/quests/quest/spectator-view";
const puzzlePath = async (puzzle: string, entry?: string) =>
  `/api/v1/quests/quest/puzzles/${puzzle}/spectator-view?entryId=${entry ?? (await entryIdOf("quest"))}`;

/**
 * What no public answer may ever contain, however far the quest has got: who
 * plays it is shown by display name only.
 */
const ALWAYS_HIDDEN = [
  /assignee/i,
  /the-team/,
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

    expect(body).toEqual({
      questName: "quest",
      displayName: "Quest",
      racing: false,
      stopsHidden: false,
      rivalsHidden: false,
      provisional: false,
      entries: [
        expect.objectContaining({
          id: await entryIdOf("quest"),
          rank: null,
          entrant: { kind: "team", displayName: "Team Display" },
          status: "notStarted",
          paused: false,
          puzzles: [],
          progress: expect.objectContaining({
            startTime: null,
            endTime: null,
            running: false,
            clockStart: null,
            elapsedMs: 0,
            puzzles: [],
          }),
        }),
      ],
    });
    expectNoneOf(text, [...ALWAYS_HIDDEN, ...UNREACHED, /riddle/i]);
  });

  it("shows only the puzzles reached, without their solutions", async () => {
    await startAndActivateFirst();

    const { body, text } = await seen();

    expect(body.entries[0].puzzles).toEqual([
      {
        puzzleName: "riddle",
        displayName: "Riddle",
        status: "inProgress",
        statusDescription: expect.any(String),
        skipped: false,
        activationTime: expect.any(String),
        solutionText: null,
      },
    ]);
    expect(body.entries[0].progress.puzzles).toHaveLength(1);
    expectNoneOf(text, [...ALWAYS_HIDDEN, ...UNREACHED, /A piano/]);
  });

  it("names the next puzzle once it's reached, and shows the solution", async () => {
    await QuestService.startQuest("quest");
    await QuestService.skipQuestPuzzle("quest", "riddle");

    const { body, text } = await seen();

    const [entry] = body.entries;
    expect(
      entry.puzzles.map((p: { puzzleName: string }) => p.puzzleName)
    ).toEqual(["riddle", "lantern"]);
    expect(entry.puzzles[0]).toMatchObject({
      skipped: true,
      solutionText: "A piano",
    });
    expect(entry.puzzles[1].solutionText).toBeNull();
    expect(entry.progress.puzzles).toHaveLength(2);
    expectNoneOf(text, [...ALWAYS_HIDDEN, /finale/i, /Lantern solution/]);
  });

  it("says when the quest is paused", async () => {
    await startAndActivateFirst();
    await QuestService.pauseQuest("quest");

    expect((await seen()).body.entries[0].paused).toBe(true);
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

    const response = await request(app).get(await puzzlePath("riddle"));

    expect(response.status).toBe(200);
    const body = JSON.parse(response.text);
    expect(spectatorPuzzleSchema.parse(body)).toEqual(body);
    expect(body).toMatchObject({
      quest: { questName: "quest", displayName: "Quest", paused: false },
      puzzle: {
        puzzleName: "riddle",
        displayName: "Riddle",
        status: "inProgress",
        type: "text",
        text: "What has **keys**?",
        hints: [{ text: "It makes music", timePenaltySeconds: 60 }],
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

    const response = await request(app).get(await puzzlePath("riddle"));

    expect(JSON.parse(response.text).puzzle).toMatchObject({
      status: "completed",
      skipped: true,
      solutionText: "A piano",
    });
  });

  it("answers alike for a puzzle waiting, unreached, and nonexistent", async () => {
    await QuestService.startQuest("quest");
    const unknown = await request(app).get(await puzzlePath("nothing"));
    expect(unknown.status).toBe(404);

    for (const puzzle of ["riddle", "lantern"]) {
      const response = await request(app).get(await puzzlePath(puzzle));

      expect(response.status).toBe(404);
      expect(response.text.replaceAll(puzzle, "nothing")).toBe(unknown.text);
    }
  });
});

describe("a quest several teams race", () => {
  let sessions: Record<string, string> = {};

  beforeEach(async () => {
    await UserModel.create([
      {
        userName: "rival",
        displayName: "Rival Person",
        email: "rival@example.com",
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
      teamName: "rival-team",
      displayName: "Rival Crew",
      joinCode: "rival-code",
      memberIds: await userIdsOf("rival"),
    });
    expect(
      await QuestService.updateQuest({
        name: "quest",
        entrants: [
          { kind: "team", name: "the-team" },
          { kind: "team", name: "rival-team" },
        ],
      })
    ).toEqual({ status: "success", statusCode: 200 });
    await QuestService.startQuest("quest");
    // The first team is a stop ahead.
    await QuestService.skipQuestPuzzle(
      "quest",
      "riddle",
      {},
      { entrant: { kind: "team", name: "the-team" } }
    );
    sessions = await startSessions("helper", "player", "rival");
  });

  function view(path: string, userName?: string) {
    const pending = request(app).get(path);
    return userName
      ? pending.set("Authorization", `Bearer ${sessions[userName]}`)
      : pending;
  }

  /** Has every entry finish, the leaders first. */
  async function finishEveryone() {
    for (const puzzleName of ["riddle", "lantern", "finale"]) {
      await QuestService.skipQuestPuzzle("quest", puzzleName);
    }
  }

  it("shows the public only the standings, with no stops, until everyone finishes", async () => {
    const response = await view(QUEST);

    expect(response.status).toBe(200);
    const body = JSON.parse(response.text);
    expect(spectatorQuestSchema.parse(body)).toEqual(body);
    expect(body).toMatchObject({
      racing: true,
      stopsHidden: true,
      rivalsHidden: false,
      provisional: false,
    });
    expect(body.entries).toEqual([
      expect.objectContaining({
        id: await entryIdOf("quest", 0),
        entrant: { kind: "team", displayName: "Team Display" },
        status: "inProgress",
        statusDescription: "In progress",
        paused: false,
        rank: null,
        puzzles: [],
        progress: expect.objectContaining({
          running: true,
          totalMs: expect.any(Number),
          puzzles: [],
        }),
      }),
      expect.objectContaining({
        id: await entryIdOf("quest", 1),
        entrant: { kind: "team", displayName: "Rival Crew" },
        rank: null,
        puzzles: [],
        progress: expect.objectContaining({ puzzles: [] }),
      }),
    ]);
    expectNoneOf(response.text, [
      ...ALWAYS_HIDDEN,
      /rival-team/,
      /Rival Person/,
      /riddle/i,
      /lantern/i,
      /finale/i,
      /A piano/,
    ]);
  });

  it.each([
    ["player", 0, "Team Display", "Rival Crew"],
    ["rival", 1, "Rival Crew", "Team Display"],
  ])(
    "shows %s, still racing, only their own entry, with no stops",
    async (userName, index, own, other) => {
      const response = await view(QUEST, userName);

      expect(response.status).toBe(200);
      const body = JSON.parse(response.text);
      expect(spectatorQuestSchema.parse(body)).toEqual(body);
      expect(body).toMatchObject({
        racing: true,
        stopsHidden: true,
        rivalsHidden: true,
        provisional: false,
      });
      expect(body.entries).toEqual([
        expect.objectContaining({
          id: await entryIdOf("quest", index),
          entrant: { kind: "team", displayName: own },
          rank: null,
          puzzles: [],
        }),
      ]);
      expect(response.text).not.toContain(other);
      expectNoneOf(response.text, [...ALWAYS_HIDDEN, /riddle/i, /A piano/]);
    }
  );

  describe("once one team has finished", () => {
    beforeEach(async () => {
      // The rivals catch up and finish first.
      for (const puzzleName of ["riddle", "lantern", "finale"]) {
        await QuestService.skipQuestPuzzle(
          "quest",
          puzzleName,
          {},
          { entrant: { kind: "team", name: "rival-team" } }
        );
      }
    });

    it("ranks it first, provisionally, for the public, staff, and share links", async () => {
      const link = await request(app)
        .post("/api/v1/quests/quest/share-links")
        .set("Authorization", `Bearer ${sessions.helper}`)
        .send({ label: "Lobby" });
      expect(link.status).toBe(201);
      const shared = request(app)
        .get(QUEST)
        .set("X-Share-Token", JSON.parse(link.text).token);

      for (const response of [
        await view(QUEST),
        await view(QUEST, "helper"),
        await shared,
      ]) {
        const body = JSON.parse(response.text);
        expect(body).toMatchObject({
          racing: true,
          rivalsHidden: false,
          provisional: true,
        });
        expect(
          body.entries.map(
            (entry: { entrant: { displayName: string }; rank: unknown }) => [
              entry.entrant.displayName,
              entry.rank,
            ]
          )
        ).toEqual([
          ["Rival Crew", 1],
          ["Team Display", null],
        ]);
      }
    });

    it("shows its player the whole leaderboard, still without stops", async () => {
      const body = JSON.parse((await view(QUEST, "rival")).text);

      expect(body).toMatchObject({
        racing: true,
        stopsHidden: true,
        rivalsHidden: false,
        provisional: true,
      });
      expect(body.entries).toEqual([
        expect.objectContaining({
          rank: 1,
          status: "completed",
          puzzles: [],
        }),
        expect.objectContaining({
          entrant: { kind: "team", displayName: "Team Display" },
          rank: null,
          status: "inProgress",
        }),
      ]);
    });

    it("still shows a player racing only their own entry", async () => {
      const body = JSON.parse((await view(QUEST, "player")).text);

      expect(body).toMatchObject({ rivalsHidden: true, provisional: false });
      expect(body.entries).toEqual([
        expect.objectContaining({
          entrant: { kind: "team", displayName: "Team Display" },
          rank: null,
        }),
      ]);
    });

    it("gives final ranks, by total time, once everyone has finished", async () => {
      await finishEveryone();

      for (const userName of [undefined, "player", "rival"]) {
        const body = JSON.parse((await view(QUEST, userName)).text);
        expect(body).toMatchObject({
          racing: false,
          stopsHidden: false,
          rivalsHidden: false,
          provisional: false,
        });
        const [first, second] = body.entries;
        expect(first.progress.totalMs).toBeLessThanOrEqual(
          second.progress.totalMs
        );
        expect(first.rank).toBe(1);
        expect(second.rank).toBe(
          second.progress.totalMs === first.progress.totalMs ? 1 : 2
        );
      }
    });
  });

  it("shows staff every entry's reached stops", async () => {
    const response = await view(QUEST, "helper");

    const body = JSON.parse(response.text);
    expect(body).toMatchObject({ racing: true, stopsHidden: false });
    expect(body.entries).toEqual([
      expect.objectContaining({
        puzzles: [
          expect.objectContaining({
            puzzleName: "riddle",
            status: "completed",
          }),
          expect.objectContaining({
            puzzleName: "lantern",
            status: "awaitingActivation",
          }),
        ],
      }),
      expect.objectContaining({
        puzzles: [
          expect.objectContaining({
            puzzleName: "riddle",
            status: "awaitingActivation",
          }),
        ],
      }),
    ]);
    expect(body.entries[1].progress.puzzles).toHaveLength(1);
    expectNoneOf(response.text, [/rival-team/, /finale/i]);
  });

  it("shows everyone the stops once every entry has finished", async () => {
    await finishEveryone();

    const body = JSON.parse((await view(QUEST)).text);

    expect(body).toMatchObject({ racing: false, stopsHidden: false });
    for (const entry of body.entries) {
      expect(
        entry.puzzles.map((p: { puzzleName: string }) => p.puzzleName)
      ).toEqual(["riddle", "lantern", "finale"]);
    }
  });

  it("hides every puzzle while racing, except from staff", async () => {
    const leaders = await entryIdOf("quest", 0);
    const path = await puzzlePath("riddle", leaders);

    for (const userName of [undefined, "player", "rival"]) {
      const response = await view(path, userName);

      expect(response.status, userName).toBe(404);
      expect(response.text).not.toContain("A piano");
    }
    const staff = await view(path, "helper");
    expect(staff.status).toBe(200);
    expect(JSON.parse(staff.text).puzzle).toMatchObject({
      status: "completed",
      solutionText: "A piano",
    });
  });

  it("follows a puzzle as the entry asked for has it, once everyone has finished", async () => {
    await QuestService.resetQuestPuzzle(
      "quest",
      "riddle",
      false,
      {},
      { entrant: { kind: "team", name: "the-team" } }
    );
    await finishEveryone();
    await QuestService.resetQuestPuzzle(
      "quest",
      "finale",
      false,
      {},
      { entrant: { kind: "team", name: "rival-team" } }
    );
    // The rivals are still racing on the finale, so the stops are hidden.
    expect((await view(QUEST)).status).toBe(200);
    expect(JSON.parse((await view(QUEST)).text).stopsHidden).toBe(true);

    await QuestService.skipQuestPuzzle("quest", "finale");
    const solved = await view(
      await puzzlePath("finale", await entryIdOf("quest", 1))
    );
    expect(solved.status).toBe(200);
    expect(JSON.parse(solved.text).puzzle).toMatchObject({
      status: "completed",
    });
  });

  it("finds no puzzle for an entry the quest doesn't have", async () => {
    await finishEveryone();

    for (const entry of ["000000000000000000000000", "not-an-id"]) {
      const response = await view(await puzzlePath("riddle", entry));

      expect(response.status).toBe(404);
      expect(JSON.parse(response.text).type).toBe("/problems/not-found");
    }
  });

  it("needs the entry to be named for a puzzle", async () => {
    const response = await view(
      "/api/v1/quests/quest/puzzles/riddle/spectator-view"
    );

    expect(response.status).toBe(400);
  });
});
