// Tests of listing a user's quests through the v1 API: what a player sees on
// signing in. Who may use the route is tested in the authorization matrix.
import type { Express } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { startSessions } from "../sessions.js";
import { userIdsOf } from "../references.js";

const { createApp } = await import("../../src/createApp.js");
const { questSummarySchema } = await import("../../src/api/v1/resources.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");

type Role = "admin" | "player" | "other";

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

function list(role: Role, userName: string, query = "") {
  return request(app)
    .get(`/api/v1/users/${userName}/quests${query}`)
    .set("Authorization", `Bearer ${sessions[role]}`);
}

/** Lists a user's quests, checking the answer is exactly what's documented. */
async function listed(role: Role, userName: string) {
  const response = await list(role, userName);
  expect(response.status).toBe(200);
  const body = JSON.parse(response.text);
  for (const item of body.items) {
    expect(questSummarySchema.parse(item)).toEqual(item);
  }
  return body;
}

function createQuest(name: string, assignee: object): Promise<unknown> {
  return QuestService.createQuest({
    name,
    displayName: `Quest ${name}`,
    entrants: [assignee as never],
    puzzles: [
      { puzzleName: "riddle", activationCode: "riddle-code" },
      { puzzleName: "finale", activationCode: "finale-code" },
    ],
  });
}

const ON_TEAM = { kind: "team", name: "team" };
const TO_PLAYER = { kind: "user", name: "player" };
const TO_OTHER = { kind: "user", name: "other" };

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    TeamModel.deleteMany({}),
    PuzzleModel.deleteMany({}),
    QuestModel.deleteMany({}),
  ]);
  await UserModel.create(
    (["admin", "player", "other"] as const).map((userName) => ({
      userName,
      displayName: userName,
      email: `${userName}@example.com`,
      password: "hash",
      authorizationLevel:
        userName === "admin"
          ? AuthorizationLevel.ADMIN
          : AuthorizationLevel.USER,
    }))
  );
  await TeamModel.create({
    teamName: "team",
    displayName: "Team",
    joinCode: "join",
    memberIds: await userIdsOf("player"),
  });
  await PuzzleModel.create([
    {
      name: "riddle",
      displayName: "Riddle",
      solutionKeyword: "piano",
      solutionDisplayText: "A piano",
      hints: [{ text: "It makes music", timePenalty: 60 }],
    },
    {
      name: "finale",
      displayName: "Finale",
      solutionKeyword: "done",
      solutionDisplayText: "Done",
    },
  ]);
  sessions = await startSessions("admin", "player", "other");
});

describe("listing a user's quests", () => {
  it("lists quests assigned to the user or their teams", async () => {
    await createQuest("mine", TO_PLAYER);
    await createQuest("ours", ON_TEAM);
    await QuestService.startQuest("mine");
    await QuestService.startQuest("ours");

    const { items, next } = await listed("player", "player");

    expect(
      items.map(({ questName }: { questName: string }) => questName)
    ).toEqual(["mine", "ours"]);
    expect(next).toBeNull();
    expect(items[0]).toMatchObject({
      displayName: "Quest mine",
      status: "inProgress",
      paused: false,
      progress: { running: true, endTime: null },
    });
  });

  it("leaves out quests that haven't started", async () => {
    await createQuest("waiting", TO_PLAYER);

    expect((await listed("player", "player")).items).toEqual([]);
  });

  it("leaves out other people's quests", async () => {
    await createQuest("theirs", TO_OTHER);
    await QuestService.startQuest("theirs");

    expect((await listed("player", "player")).items).toEqual([]);
  });

  it("includes completed quests", async () => {
    await createQuest("done", TO_PLAYER);
    await QuestService.startQuest("done");
    await QuestModel.updateOne({ name: "done" }, { "entries.0.status": 2 });

    const { items } = await listed("player", "player");

    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("completed");
  });

  it("says when a quest is paused", async () => {
    await createQuest("mine", TO_PLAYER);
    await QuestService.startQuest("mine");
    await QuestService.pauseQuest("mine");

    expect((await listed("player", "player")).items[0].paused).toBe(true);
  });

  it("reveals nothing about a quest's puzzles, so not how long it is", async () => {
    await createQuest("mine", TO_PLAYER);
    await QuestService.startQuest("mine");

    const response = await list("player", "player");

    // Checks the raw answer, so no field can give the quest's length away.
    expect(response.text).not.toMatch(/finale/i);
    expect(response.text).not.toMatch(/riddle/i);
    expect(response.text).not.toContain("code");
    expect(response.text).not.toContain("puzzles");
    expect(response.text).not.toContain("piano");
  });

  it("gives its results a page at a time", async () => {
    for (const name of ["one", "two", "three"]) {
      await createQuest(name, TO_PLAYER);
      await QuestService.startQuest(name);
    }

    const first = JSON.parse((await list("player", "player", "?limit=2")).text);
    const second = JSON.parse(
      (await list("player", "player", `?limit=2&after=${first.next}`)).text
    );

    const names = (page: { items: { questName: string }[] }) =>
      page.items.map(({ questName }) => questName);
    expect(names(first)).toEqual(["one", "two"]);
    expect(names(second)).toEqual(["three"]);
    expect(second.next).toBeNull();
  });

  it("shows an administrator a player's quests", async () => {
    await createQuest("ours", ON_TEAM);
    await QuestService.startQuest("ours");

    const { items } = await listed("admin", "player");

    expect(
      items.map(({ questName }: { questName: string }) => questName)
    ).toEqual(["ours"]);
  });

  it("answers 404 for a user who doesn't exist", async () => {
    const response = await list("admin", "nobody");

    expect(response.status).toBe(404);
    expect(response.type).toBe("application/problem+json");
  });
});
