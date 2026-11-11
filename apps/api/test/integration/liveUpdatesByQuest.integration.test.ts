// Tests of following a quest over the live-update websocket as it's played
// through the API. Anyone can subscribe, players included, so these check the
// raw messages: nothing may show what a player couldn't see.
import * as http from "http";
import type { AddressInfo } from "net";
import type { Express } from "express";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { entryIdOf } from "../references.js";
import WebSocket from "ws";
import { startSessions } from "../sessions.js";

const { createApp } = await import("../../src/createApp.js");
const { subscribeQuestEventHandlers } =
  await import("../../src/events/subscribers.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");
const UserService = await import("../../src/services/user.service.js");
const { createShareLink } =
  await import("../../src/services/shareLink.service.js");
const QuestService = await import("../../src/services/quest.service.js");
const WebSocketService =
  await import("../../src/services/websocket.service.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let server: http.Server;
let port: number;
let session = "";
let clients: WebSocket[] = [];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = createApp();
  subscribeQuestEventHandlers();
  const socketServer = WebSocketService.initialize();
  server = http.createServer();
  // Same wiring as app.ts.
  server.on("upgrade", (req, socket, header) => {
    socketServer.handleUpgrade(req, socket, header, (ws) =>
      socketServer.emit("connection", ws, req)
    );
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
}, 120000);

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    PuzzleModel.deleteMany({}),
    QuestModel.deleteMany({}),
  ]);
  await UserModel.create({
    userName: "player",
    displayName: "Player",
    email: "player@example.com",
    password: "hash",
  });
  await PuzzleModel.create([
    {
      name: "riddle",
      displayName: "Riddle",
      solutionKeyword: "pianokeyword",
      solutionDisplayText: "A piano",
      hints: [
        { text: "It makes music", timePenalty: 60 },
        { text: "Unrevealed hint", timePenalty: 300 },
      ],
    },
    {
      name: "lantern",
      displayName: "Lantern",
      solutionKeyword: "lanternkeyword",
      solutionDisplayText: "Lantern solution",
    },
    {
      name: "finale",
      displayName: "Finale",
      solutionKeyword: "finalekeyword",
      solutionDisplayText: "Finale solution",
    },
  ]);
  await QuestService.createQuest({
    name: "quest",
    displayName: "Quest",
    entrants: [{ kind: "user", name: "player" }],
    puzzles: [
      { puzzleName: "riddle", activationCode: "riddle-code" },
      { puzzleName: "lantern", activationCode: "lantern-code" },
      { puzzleName: "finale", activationCode: "finale-code" },
    ],
  });
  await QuestService.startQuest("quest");
  ({ player: session } = await startSessions("player"));
});

afterEach(() => {
  clients.forEach((client) => client.close());
  clients = [];
});

/**
 * Connects a client following a quest, keeping the raw text of each message.
 * @param questName the quest
 * @param as who follows: a signed-in user's session token, or a share link's
 *  token; anyone, if left out
 * @returns the client
 */
async function follow(
  questName: string,
  as: { token?: string; shareToken?: string } = {}
) {
  const socket = new WebSocket(`ws://localhost:${port}/api/v1/updates`);
  clients.push(socket);
  const raw: string[] = [];
  socket.on("message", (data) => raw.push(data.toString()));
  await new Promise((resolve) => socket.on("open", resolve));
  const issuing = request(app).post(`/api/v1/quests/${questName}/live-tickets`);
  if (as.token) {
    issuing.set("Authorization", `Bearer ${as.token}`);
  }
  if (as.shareToken) {
    issuing.set("X-Share-Token", as.shareToken);
  }
  const { text } = await issuing;
  const { ticket } = JSON.parse(text) as { ticket: string };
  socket.send(JSON.stringify({ message: "subscribe", questName, ticket }));
  await vi.waitFor(() => expect(raw).toHaveLength(1));
  const { connectionId } = JSON.parse(raw[0]) as { connectionId: string };
  raw.length = 0;
  return {
    connectionId,
    raw,
    kinds: () => raw.map((text) => JSON.parse(text).message as string),
  };
}

function play(action: string, puzzle: string, body: object) {
  return request(app)
    .post(`/api/v1/quests/quest/puzzles/${puzzle}/${action}`)
    .set("Authorization", `Bearer ${session}`)
    .send(body)
    .expect(200);
}

describe("following a quest as it's played", () => {
  it("sends each change, and nothing about puzzles not yet reached", async () => {
    const follower = await follow("quest");

    await play("activation", "riddle", { activationCode: "riddle-code" });
    await play("hints", "riddle", {});
    await play("solution-attempts", "riddle", { guess: "pianokeyword" });

    await vi.waitFor(() =>
      expect(follower.kinds()).toEqual([
        "puzzleActivated",
        "hintRequested",
        "puzzleSolved",
        "puzzleStarted",
      ])
    );
    const text = follower.raw.join("\n");
    expect(text).toContain("It makes music");
    expect(text).toContain("Lantern");
    for (const hidden of [
      /finale/i,
      /-code/,
      /keyword/,
      /Unrevealed hint/,
      /Lantern solution/,
      /assignee/,
    ]) {
      expect(text).not.toMatch(hidden);
    }
  });

  it("doesn't send players' own actions back to them", async () => {
    const acting = await follow("quest");
    const other = await follow("quest");

    await play("activation", "riddle", { activationCode: "riddle-code" });
    await play("hints", "riddle", { connectionId: acting.connectionId });

    await vi.waitFor(() =>
      expect(other.kinds()).toEqual(["puzzleActivated", "hintRequested"])
    );
    expect(acting.kinds()).toEqual(["puzzleActivated"]);
  });

  it("says when the quest is complete, only after the last puzzle", async () => {
    await QuestService.skipQuestPuzzle("quest", "riddle");
    await QuestService.skipQuestPuzzle("quest", "lantern");
    const follower = await follow("quest");

    await play("activation", "finale", { activationCode: "finale-code" });
    await play("solution-attempts", "finale", { guess: "finalekeyword" });

    await vi.waitFor(() =>
      expect(follower.kinds()).toEqual(["puzzleActivated", "puzzleSolved"])
    );
    expect(JSON.parse(follower.raw[1]).questComplete).toBe(true);
  });

  it("tells followers when the puzzle master changes the quest", async () => {
    const follower = await follow("quest");

    await QuestService.pauseQuest("quest");

    await vi.waitFor(() => expect(follower.kinds()).toEqual(["questUpdated"]));
    expect(JSON.parse(follower.raw[0]).entryId).toBe(await entryIdOf("quest"));
  });

  it("sends nothing about another quest", async () => {
    await QuestService.createQuest({
      name: "another-quest",
      displayName: "Another",
      entrants: [{ kind: "user", name: "player" }],
      puzzles: [],
    });
    const follower = await follow("another-quest");

    await play("activation", "riddle", { activationCode: "riddle-code" });
    await QuestService.pauseQuest("quest");

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(follower.raw).toEqual([]);
  });
});

describe("following a quest several race", () => {
  let tokens: Record<string, string> = {};
  let playerEntry = "";

  beforeEach(async () => {
    await UserModel.create([
      {
        userName: "rival",
        displayName: "Rival",
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
    await QuestService.updateQuest({
      name: "quest",
      entrants: [
        { kind: "user", name: "player" },
        { kind: "user", name: "rival" },
      ],
    });
    await QuestService.startQuest("quest");
    tokens = await startSessions("player", "rival", "helper");
    playerEntry = await entryIdOf("quest", 0);
  });

  /** The player plays the first stop: activates it, reveals a hint, solves it. */
  async function playFirstStop() {
    await play("activation", "riddle", { activationCode: "riddle-code" });
    await play("hints", "riddle", {});
    await play("solution-attempts", "riddle", { guess: "pianokeyword" });
  }

  it.each([["the entry's own player"], ["staff"]])(
    "sends %s what happened",
    async (who) => {
      const follower = await follow("quest", {
        token: who === "staff" ? tokens.helper : tokens.player,
      });

      await playFirstStop();

      await vi.waitFor(() =>
        expect(follower.kinds()).toEqual([
          "puzzleActivated",
          "hintRequested",
          "puzzleSolved",
          "puzzleStarted",
        ])
      );
      const text = follower.raw.join("\n");
      expect(text).toContain("It makes music");
      expect(text).toContain("A piano");
      for (const message of follower.raw) {
        expect(JSON.parse(message).entryId).toBe(playerEntry);
      }
    }
  );

  it.each([["a rival player"], ["the public"], ["a share link's holder"]])(
    "tells %s only that the entry changed",
    async (who) => {
      const helper = (await UserService.getUserByUserName("helper")).data!;
      const quest = (await QuestModel.findOne({ name: "quest" }).lean())!;
      const as =
        who === "a rival player"
          ? { token: tokens.rival }
          : who === "the public"
            ? {}
            : {
                shareToken: (
                  await createShareLink(quest._id, helper, "For a friend")
                ).token,
              };
      const follower = await follow("quest", as);

      await playFirstStop();

      await vi.waitFor(() => expect(follower.raw).toHaveLength(4));
      expect(follower.raw.map((text) => JSON.parse(text))).toEqual(
        Array(4).fill({
          message: "questUpdated",
          questName: "quest",
          entryId: playerEntry,
        })
      );
      const text = follower.raw.join("\n");
      for (const hidden of [/riddle/i, /music/, /piano/i, /Lantern/]) {
        expect(text).not.toMatch(hidden);
      }
    }
  );

  it("tells everyone what happened once every entry has finished", async () => {
    await QuestService.skipQuestPuzzle("quest", "riddle");
    await QuestService.skipQuestPuzzle("quest", "lantern");
    await QuestService.skipQuestPuzzle(
      "quest",
      "finale",
      {},
      { entrant: { kind: "user", name: "rival" } }
    );
    const follower = await follow("quest", { token: tokens.rival });

    await play("activation", "finale", { activationCode: "finale-code" });
    await play("solution-attempts", "finale", { guess: "finalekeyword" });

    // Still racing when the finale is activated; finished once it's solved.
    await vi.waitFor(() =>
      expect(follower.kinds()).toEqual(["questUpdated", "puzzleSolved"])
    );
    expect(JSON.parse(follower.raw[1])).toMatchObject({
      entryId: playerEntry,
      solutionText: "Finale solution",
      questComplete: true,
    });
  });
});
