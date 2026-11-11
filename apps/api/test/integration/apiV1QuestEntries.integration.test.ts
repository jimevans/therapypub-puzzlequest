// Tests of quests several users and teams race through, through the v1 API:
// each entrant plays the same stops with its own progress, players see only
// their own entry, and the puzzle master acts on one entrant or on them all.
import type { Express } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { startSessions } from "../sessions.js";
import { entryIdOf, userIdsOf } from "../references.js";

const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel, QuestPuzzleStatus } =
  await import("../../src/models/quest.model.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");
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
  ]);
  await UserModel.create(
    (["admin", "solo", "red1", "red2", "blue1", "loner"] as const).map(
      (userName) => ({
        userName,
        displayName: userName,
        email: `${userName}@example.com`,
        password: "hash",
        authorizationLevel:
          userName === "admin"
            ? AuthorizationLevel.ADMIN
            : AuthorizationLevel.USER,
      })
    )
  );
  await TeamModel.create([
    {
      teamName: "reds",
      displayName: "The Reds",
      joinCode: "red-code",
      memberIds: await userIdsOf("red1", "red2"),
    },
    {
      teamName: "blues",
      displayName: "The Blues",
      joinCode: "blue-code",
      memberIds: await userIdsOf("blue1"),
    },
  ]);
  await PuzzleModel.create(
    ["first", "second", "third"].map((name) => ({
      name,
      displayName: name.toUpperCase(),
      solutionKeyword: name,
      solutionDisplayText: `${name} solution`,
      hints: [{ text: `${name} hint`, timePenalty: 60 }],
    }))
  );
  expect(
    await QuestService.createQuest({
      name: "race",
      displayName: "The Race",
      entrants: [
        { kind: "team", name: "reds" },
        { kind: "team", name: "blues" },
        { kind: "user", name: "solo" },
      ],
      puzzles: [
        { puzzleName: "first", activationCode: "code-1" },
        { puzzleName: "second", activationCode: "code-2" },
        { puzzleName: "third", activationCode: "code-3" },
      ],
    })
  ).toEqual({ status: "success", statusCode: 200 });
  sessions = await startSessions("admin", "solo", "red1", "blue1", "loner");
});

type Role = "admin" | "solo" | "red1" | "blue1" | "loner";

function as(role: Role, method: "get" | "post" | "patch", path: string) {
  return request(app)
    [method](`/api/v1${path}`)
    .set("Authorization", `Bearer ${sessions[role]}`);
}

function bodyOf(response: request.Response) {
  return JSON.parse(response.text);
}

/** Each entry's entrant and status, as an administrator sees the quest. */
async function statuses(): Promise<[string, string][]> {
  const quest = bodyOf(await as("admin", "get", "/quests/race"));
  return quest.entries.map(
    (entry: { entrant: { name: string }; status: string }) => [
      entry.entrant.name,
      entry.status,
    ]
  );
}

/** Each entry's progress on each stop, as stored. */
async function storedProgress(): Promise<number[][]> {
  const quest = (await QuestModel.findOne({ name: "race" }).lean())!;
  return quest.entries.map((entry) =>
    entry.puzzles.map((puzzle) => puzzle.status)
  );
}

/** Plays the first stop as a player: activates and solves it. */
async function solveFirst(role: Role) {
  expect(
    (
      await as(role, "post", "/quests/race/puzzles/first/activation").send({
        activationCode: "code-1",
      })
    ).status
  ).toBe(200);
  expect(
    (
      await as(
        role,
        "post",
        "/quests/race/puzzles/first/solution-attempts"
      ).send({ guess: "first" })
    ).status
  ).toBe(200);
}

describe("a quest several entrants race", () => {
  it("is created with an entry for each, in order, none started", async () => {
    const quest = bodyOf(await as("admin", "get", "/quests/race"));

    expect(quest.entries).toHaveLength(3);
    expect(
      quest.entries.map(
        (entry: { id: string; entrant: object; status: string }) => [
          entry.id,
          entry.entrant,
          entry.status,
        ]
      )
    ).toEqual([
      [
        await entryIdOf("race", 0),
        { kind: "team", name: "reds", displayName: "The Reds" },
        "notStarted",
      ],
      [
        await entryIdOf("race", 1),
        { kind: "team", name: "blues", displayName: "The Blues" },
        "notStarted",
      ],
      [
        await entryIdOf("race", 2),
        { kind: "player", name: "solo", displayName: "solo" },
        "notStarted",
      ],
    ]);
    // One activation code for each stop, the same for every entrant.
    for (const entry of quest.entries) {
      expect(
        entry.puzzles.map((p: { activationCode: string }) => p.activationCode)
      ).toEqual(["code-1", "code-2", "code-3"]);
    }
  });

  it("is played by each entrant independently", async () => {
    await as("admin", "post", "/quests/race/start").expect(200);

    await solveFirst("red1");

    expect(await storedProgress()).toEqual([
      [
        QuestPuzzleStatus.COMPLETED,
        QuestPuzzleStatus.AWAITING_ACTIVATION,
        QuestPuzzleStatus.UNAVAILABLE,
      ],
      [
        QuestPuzzleStatus.AWAITING_ACTIVATION,
        QuestPuzzleStatus.UNAVAILABLE,
        QuestPuzzleStatus.UNAVAILABLE,
      ],
      [
        QuestPuzzleStatus.AWAITING_ACTIVATION,
        QuestPuzzleStatus.UNAVAILABLE,
        QuestPuzzleStatus.UNAVAILABLE,
      ],
    ]);
    // Another team, at the same stop, plays it for itself.
    await solveFirst("blue1");
    expect((await storedProgress())[1][0]).toBe(QuestPuzzleStatus.COMPLETED);
    expect((await storedProgress())[2][0]).toBe(
      QuestPuzzleStatus.AWAITING_ACTIVATION
    );
  });

  it("shows a player only their own entry", async () => {
    await as("admin", "post", "/quests/race/start").expect(200);
    await solveFirst("red1");

    const response = await as("blue1", "get", "/quests/race");

    expect(response.status).toBe(200);
    const quest = bodyOf(response);
    expect(quest.entries).toHaveLength(1);
    expect(quest.entries[0]).toMatchObject({
      id: await entryIdOf("race", 1),
      entrant: { kind: "team", name: "blues" },
      puzzles: [{ puzzleName: "first", status: "awaitingActivation" }],
    });
    expect(response.text).not.toMatch(/reds|solo|second|third/);
  });

  it("ranks, for an administrator, the entries that have finished, in entry order", async () => {
    await as("admin", "post", "/quests/race/start").expect(200);
    for (const name of ["blues", "solo"]) {
      for (const puzzle of ["first", "second", "third"]) {
        await QuestService.skipQuestPuzzle(
          "race",
          puzzle,
          {},
          { entrant: { kind: name === "solo" ? "user" : "team", name } }
        );
      }
    }

    const quest = bodyOf(await as("admin", "get", "/quests/race"));
    const [reds, blues, solo] = quest.entries;

    expect(reds).toMatchObject({ entrant: { name: "reds" }, rank: null });
    expect(blues.entrant.name).toBe("blues");
    expect(solo.entrant.name).toBe("solo");
    const [faster, slower] =
      blues.progress.totalMs <= solo.progress.totalMs
        ? [blues, solo]
        : [solo, blues];
    expect(faster.rank).toBe(1);
    expect(slower.rank).toBe(
      slower.progress.totalMs === faster.progress.totalMs ? 1 : 2
    );
    // A player's own entry has no rank: it's only for administrators.
    const own = bodyOf(await as("blue1", "get", "/quests/race"));
    expect(own.entries[0]).not.toHaveProperty("rank");
  });

  it("shows a player their own entry's puzzle", async () => {
    await as("admin", "post", "/quests/race/start").expect(200);
    await solveFirst("red1");

    const red = bodyOf(await as("red1", "get", "/quests/race/puzzles/first"));
    const blue = bodyOf(await as("blue1", "get", "/quests/race/puzzles/first"));

    expect(red.puzzle.status).toBe("completed");
    expect(red.next).toEqual({ puzzleName: "second", displayName: "SECOND" });
    expect(blue.puzzle.status).toBe("awaitingActivation");
    expect(blue.next).toBeNull();
    expect(
      (await as("blue1", "get", "/quests/race/puzzles/second")).status
    ).toBe(404);
  });

  it("lists, for a player, the quest with only their own entry", async () => {
    await as("admin", "post", "/quests/race/start").expect(200);
    await solveFirst("red1");

    const response = await as("blue1", "get", "/users/blue1/quests");

    expect(bodyOf(response).items).toEqual([
      expect.objectContaining({ questName: "race", status: "inProgress" }),
    ]);
    expect(bodyOf(response).items[0].progress.elapsedMs).toBeGreaterThanOrEqual(
      0
    );
  });

  it("is refused to a player who isn't in any entry", async () => {
    await as("admin", "post", "/quests/race/start").expect(200);

    expect((await as("loner", "get", "/quests/race")).status).toBe(404);
    const response = await as(
      "loner",
      "post",
      "/quests/race/puzzles/first/activation"
    ).send({ activationCode: "code-1" });
    expect(response.status).toBe(403);
  });

  it("is refused, clearly, to a player who has come to be in two entries", async () => {
    await as("admin", "post", "/quests/race/start").expect(200);
    // Joining a team after the quest was saved can do this.
    await TeamModel.updateOne(
      { teamName: "blues" },
      { $push: { memberIds: (await userIdsOf("red1"))[0] } }
    );

    const response = await as(
      "red1",
      "post",
      "/quests/race/puzzles/first/activation"
    ).send({ activationCode: "code-1" });

    expect(response.status).toBe(409);
    expect(bodyOf(response)).toMatchObject({
      type: "/problems/wrong-state",
      detail: expect.stringContaining("team reds and team blues"),
    });
    expect((await as("red1", "get", "/quests/race/puzzles/first")).status).toBe(
      409
    );
  });
});

describe("running a whole quest", () => {
  it("starts every entry not yet started, leaving the others", async () => {
    await as("admin", "post", "/quests/race/teams/blues/start").expect(200);
    await solveFirst("blue1");

    const response = await as("admin", "post", "/quests/race/start");

    expect(response.status).toBe(200);
    expect(await statuses()).toEqual([
      ["reds", "inProgress"],
      ["blues", "inProgress"],
      ["solo", "inProgress"],
    ]);
    // The blues' progress was kept.
    expect((await storedProgress())[1][0]).toBe(QuestPuzzleStatus.COMPLETED);
  });

  it("refuses to start once every entry has started", async () => {
    await as("admin", "post", "/quests/race/start").expect(200);

    const response = await as("admin", "post", "/quests/race/start");

    expect(response.status).toBe(409);
    expect(bodyOf(response).type).toBe("/problems/wrong-state");
  });

  it("pauses and resumes every entry in progress", async () => {
    await as("admin", "post", "/quests/race/teams/reds/start").expect(200);
    await as("admin", "post", "/quests/race/players/solo/start").expect(200);
    await as("admin", "post", "/quests/race/players/solo/pause").expect(200);

    const paused = bodyOf(await as("admin", "post", "/quests/race/pause"));

    expect(
      paused.entries.map((entry: { paused: boolean }) => entry.paused)
    ).toEqual([true, false, true]);
    const resumed = bodyOf(await as("admin", "post", "/quests/race/resume"));
    expect(
      resumed.entries.map((entry: { paused: boolean }) => entry.paused)
    ).toEqual([false, false, false]);
    expect((await as("admin", "post", "/quests/race/resume")).status).toBe(409);
  });

  it("resets every entry", async () => {
    await as("admin", "post", "/quests/race/start").expect(200);
    await solveFirst("red1");

    const response = await as("admin", "post", "/quests/race/reset");

    expect(response.status).toBe(200);
    expect(await statuses()).toEqual([
      ["reds", "notStarted"],
      ["blues", "notStarted"],
      ["solo", "notStarted"],
    ]);
  });
});

describe("running one entrant's entry", () => {
  it("starts, pauses, resumes, and resets only that entrant", async () => {
    await as("admin", "post", "/quests/race/teams/reds/start").expect(200);
    await as("admin", "post", "/quests/race/players/solo/start").expect(200);
    expect(await statuses()).toEqual([
      ["reds", "inProgress"],
      ["blues", "notStarted"],
      ["solo", "inProgress"],
    ]);

    const paused = bodyOf(
      await as("admin", "post", "/quests/race/teams/reds/pause")
    );
    expect(
      paused.entries.map((entry: { paused: boolean }) => entry.paused)
    ).toEqual([true, false, false]);
    // A paused team can't play; the others can.
    expect(
      (
        await as("red1", "post", "/quests/race/puzzles/first/activation").send({
          activationCode: "code-1",
        })
      ).status
    ).toBe(409);
    await as("admin", "post", "/quests/race/teams/reds/resume").expect(200);
    await as("admin", "post", "/quests/race/players/solo/pause").expect(200);
    await as("admin", "post", "/quests/race/players/solo/resume").expect(200);
    await solveFirst("red1");

    await as("admin", "post", "/quests/race/teams/reds/reset").expect(200);
    await as("admin", "post", "/quests/race/players/solo/reset").expect(200);

    expect(await statuses()).toEqual([
      ["reds", "notStarted"],
      ["blues", "notStarted"],
      ["solo", "notStarted"],
    ]);
  });

  it("resets a solved puzzle for that entrant alone", async () => {
    await as("admin", "post", "/quests/race/start").expect(200);
    await solveFirst("red1");
    await solveFirst("blue1");

    const response = await as(
      "admin",
      "post",
      "/quests/race/teams/reds/puzzles/first/reset"
    ).send({ refundHints: true });

    expect(response.status).toBe(200);
    const [reds, blues] = await storedProgress();
    expect(reds[0]).toBe(QuestPuzzleStatus.IN_PROGRESS);
    expect(blues[0]).toBe(QuestPuzzleStatus.COMPLETED);
  });

  it("isn't found for a user or team not playing the quest", async () => {
    for (const path of [
      "/quests/race/teams/nobody/start",
      "/quests/race/players/loner/start",
      // A team, named as a player, isn't one.
      "/quests/race/players/reds/start",
      "/quests/race/teams/nobody/puzzles/first/skip",
    ]) {
      const response = await as("admin", "post", path);

      expect(response.status, path).toBe(404);
      expect(bodyOf(response).type).toBe("/problems/not-found");
    }
  });

  it("refuses to start an entry already started", async () => {
    await as("admin", "post", "/quests/race/players/solo/start").expect(200);

    const response = await as(
      "admin",
      "post",
      "/quests/race/players/solo/start"
    );

    expect(response.status).toBe(409);
  });
});

describe("a quest's entrants", () => {
  function update(body: object) {
    return as("admin", "patch", "/quests/race").send(body);
  }

  it("must include at least one", async () => {
    const created = await as("admin", "post", "/quests").send({
      questName: "empty",
      displayName: "Empty",
      entrants: [],
    });
    expect(created.status).toBe(400);
    expect(bodyOf(created).errors).toEqual([
      { path: "body.entrants", message: expect.any(String) },
    ]);

    expect((await update({ entrants: [] })).status).toBe(400);
  });

  it("can't include a player twice, as a user and in a team", async () => {
    const response = await as("admin", "post", "/quests").send({
      questName: "overlap",
      displayName: "Overlap",
      entrants: [
        { kind: "team", name: "reds" },
        { kind: "player", name: "red2" },
      ],
    });

    expect(response.status).toBe(422);
    expect(bodyOf(response)).toMatchObject({
      type: "/problems/invalid-quest",
      detail: expect.stringMatching(
        /^Player red2 would be in two of the quest's entrants, team reds and user red2/
      ),
      // About the entrants, so a form can show it beside them.
      errors: [{ path: "body.entrants", message: expect.any(String) }],
    });
    expect(await QuestModel.exists({ name: "overlap" })).toBeNull();
  });

  it("can't include a player in two teams", async () => {
    await TeamModel.updateOne(
      { teamName: "blues" },
      { $push: { memberIds: (await userIdsOf("red1"))[0] } }
    );

    const response = await update({
      entrants: [
        { kind: "team", name: "reds" },
        { kind: "team", name: "blues" },
      ],
    });

    expect(response.status).toBe(422);
    expect(bodyOf(response).detail).toMatch(
      /Player red1 .* team reds and team blues/
    );
  });

  it("can't include the same team twice", async () => {
    const response = await update({
      entrants: [
        { kind: "team", name: "reds" },
        { kind: "team", name: "reds" },
      ],
    });

    expect(response.status).toBe(422);
  });

  it("can lose one that hasn't started, keeping the others' progress", async () => {
    await as("admin", "post", "/quests/race/teams/reds/start").expect(200);
    await solveFirst("red1");

    const response = await update({
      entrants: [
        { kind: "player", name: "solo" },
        { kind: "team", name: "reds" },
      ],
    });

    expect(response.status).toBe(200);
    // In the order given; the reds' entry, progress and all.
    expect(await statuses()).toEqual([
      ["solo", "notStarted"],
      ["reds", "inProgress"],
    ]);
    expect((await storedProgress())[1][0]).toBe(QuestPuzzleStatus.COMPLETED);
  });

  it("can't lose one that has started, until it's reset", async () => {
    await as("admin", "post", "/quests/race/teams/reds/start").expect(200);

    const response = await update({
      entrants: [
        { kind: "team", name: "blues" },
        { kind: "player", name: "solo" },
      ],
    });

    expect(response.status).toBe(409);
    expect(bodyOf(response)).toMatchObject({
      type: "/problems/wrong-state",
      detail:
        "team reds has started quest race, so can't be removed from it; reset it first",
      errors: [
        {
          path: "body.entrants",
          message:
            "team reds has started quest race, so can't be removed from it; reset it first",
        },
      ],
    });
    expect(await statuses()).toHaveLength(3);

    await as("admin", "post", "/quests/race/teams/reds/reset").expect(200);
    expect(
      (
        await update({
          entrants: [
            { kind: "team", name: "blues" },
            { kind: "player", name: "solo" },
          ],
        })
      ).status
    ).toBe(200);
  });

  it("gives a new one fresh progress on every stop", async () => {
    await as("admin", "post", "/quests/race/start").expect(200);
    await solveFirst("red1");

    const response = await update({
      entrants: [
        { kind: "team", name: "reds" },
        { kind: "team", name: "blues" },
        { kind: "player", name: "solo" },
        { kind: "player", name: "loner" },
      ],
    });

    expect(response.status).toBe(200);
    const loner = bodyOf(response).entries[3];
    expect(loner).toMatchObject({
      entrant: { kind: "player", name: "loner" },
      status: "notStarted",
      statusDescription: "Not yet started",
    });
    expect(loner.puzzles.map((p: { status: string }) => p.status)).toEqual([
      "notReached",
      "notReached",
      "notReached",
    ]);
    expect((await storedProgress())[0][0]).toBe(QuestPuzzleStatus.COMPLETED);
  });

  it("refuses one that doesn't exist", async () => {
    const response = await update({
      entrants: [{ kind: "team", name: "nobody" }],
    });

    expect(response.status).toBe(422);
    expect(bodyOf(response).detail).toBe("No team with name nobody found");
  });
});

describe("a quest's puzzle list, with several entrants", () => {
  it("keeps every entry's reached stops in place", async () => {
    await as("admin", "post", "/quests/race/teams/blues/start").expect(200);
    await solveFirst("blue1");

    // The reds haven't started, but the blues have reached the second stop.
    const moved = await as("admin", "patch", "/quests/race").send({
      puzzles: [
        { puzzleName: "first" },
        { puzzleName: "third" },
        { puzzleName: "second" },
      ],
    });
    expect(moved.status).toBe(409);
    expect(bodyOf(moved).detail).toBe(
      "Puzzle second has already been reached by team blues, so it must stay in its place at the start of the quest"
    );

    const later = await as("admin", "patch", "/quests/race").send({
      puzzles: [{ puzzleName: "first" }, { puzzleName: "second" }],
    });
    expect(later.status).toBe(200);
    for (const entry of bodyOf(later).entries) {
      expect(entry.puzzles).toHaveLength(2);
    }
  });

  it("can't change once any entry has completed the quest", async () => {
    await QuestService.updateQuest({
      name: "race",
      puzzles: [{ puzzleName: "first" }],
    });
    await as("admin", "post", "/quests/race/players/solo/start").expect(200);
    await solveFirst("solo");

    const response = await as("admin", "patch", "/quests/race").send({
      puzzles: [{ puzzleName: "first" }, { puzzleName: "second" }],
    });

    expect(response.status).toBe(409);
    expect(bodyOf(response).detail).toBe(
      "Quest race is completed by user solo, so its puzzles can't change until that entry is reset"
    );
  });
});
