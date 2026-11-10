// A private quest can be followed only by its players and staff. Anyone else
// must be unable to tell it from a quest that doesn't exist, over the API or
// the live-update websocket.
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
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { entryIdOf } from "../references.js";
import WebSocket from "ws";
import { QuestPuzzleStatus } from "../../src/domain/quest/state.js";
import { startSessions } from "../sessions.js";

const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const WebSocketService =
  await import("../../src/services/websocket.service.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let server: http.Server;
let port: number;
let sessions: Record<string, string>;
let clients: WebSocket[] = [];

const QUEST = "/api/v1/quests/secret/spectator-view";
const PUZZLE = "/api/v1/quests/secret/puzzles/riddle/spectator-view";

/** The path of the puzzle as the quest's entry has it. */
const puzzlePath = async () => `${PUZZLE}?entry=${await entryIdOf("secret")}`;
const TICKET = "/api/v1/quests/secret/live-tickets";

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = createApp();
  server = http.createServer();
  WebSocketService.attachToServer(
    server,
    WebSocketService.initialize(),
    () => false
  );
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
}, 120000);

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongoServer?.stop();
});

async function createUser(userName: string, authorizationLevel?: number) {
  return UserModel.create({
    userName,
    displayName: userName,
    email: `${userName}@example.com`,
    password: "hash",
    ...(authorizationLevel === undefined ? {} : { authorizationLevel }),
  });
}

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    TeamModel.deleteMany({}),
    PuzzleModel.deleteMany({}),
    QuestModel.deleteMany({}),
  ]);
  await createUser("player");
  const teammate = await createUser("teammate");
  await createUser("stranger");
  await createUser("helper", AuthorizationLevel.STAFF);
  await createUser("boss", AuthorizationLevel.ADMIN);
  await TeamModel.create({
    teamName: "reds",
    displayName: "Reds",
    joinCode: "join",
    memberIds: [teammate._id],
  });
  await PuzzleModel.create({
    name: "riddle",
    displayName: "Riddle",
    solutionKeyword: "piano",
    solutionDisplayText: "A piano",
  });
  await QuestService.createQuest({
    name: "secret",
    displayName: "Secret",
    visibility: "private",
    entrants: [{ kind: "user", name: "player" }],
    puzzles: [{ puzzleName: "riddle", activationCode: "code" }],
  });
  await QuestModel.updateOne(
    { name: "secret" },
    { "entries.0.puzzles.0.status": QuestPuzzleStatus.IN_PROGRESS }
  );
  await QuestService.createQuest({
    name: "open",
    displayName: "Open",
    entrants: [{ kind: "user", name: "player" }],
    puzzles: [],
  });
  sessions = await startSessions(
    "player",
    "teammate",
    "stranger",
    "helper",
    "boss"
  );
});

afterEach(() => {
  clients.forEach((client) => client.terminate());
  clients = [];
});

function asUser(call: request.Test, userName?: string): request.Test {
  return userName
    ? call.set("Authorization", `Bearer ${sessions[userName]}`)
    : call;
}

const view = (path: string, userName?: string) =>
  asUser(request(app).get(path), userName);
const ticket = (path: string, userName?: string) =>
  asUser(request(app).post(path), userName);

describe("a private quest", () => {
  it.each([[undefined], ["stranger"]])(
    "is not found by %s, over any route",
    async (userName) => {
      expect((await view(QUEST, userName)).status).toBe(404);
      expect((await view(await puzzlePath(), userName)).status).toBe(404);
      expect((await ticket(TICKET, userName)).status).toBe(404);
    }
  );

  it("answers exactly as a quest that doesn't exist does", async () => {
    const secret = await view(QUEST);
    const nothing = await view("/api/v1/quests/nothing/spectator-view");

    expect(secret.text.replaceAll("secret", "nothing")).toBe(nothing.text);
  });

  it.each([["player"], ["helper"], ["boss"]])(
    "can be followed by %s",
    async (userName) => {
      expect((await view(QUEST, userName)).status).toBe(200);
      expect((await view(await puzzlePath(), userName)).status).toBe(200);
      expect((await ticket(TICKET, userName)).status).toBe(201);
    }
  );

  it("can be followed by a member of the team it's assigned to", async () => {
    await request(app)
      .patch("/api/v1/quests/secret")
      .set("Authorization", `Bearer ${sessions.boss}`)
      .send({ entrants: [{ kind: "team", name: "reds" }] })
      .expect(200);

    expect((await view(QUEST, "teammate")).status).toBe(200);
    expect((await view(QUEST, "player")).status).toBe(404);
  });

  it("can be followed by the players of any of its entries", async () => {
    await request(app)
      .patch("/api/v1/quests/secret")
      .set("Authorization", `Bearer ${sessions.boss}`)
      .send({
        entrants: [
          { kind: "user", name: "player" },
          { kind: "team", name: "reds" },
        ],
      })
      .expect(200);

    for (const userName of ["player", "teammate"]) {
      expect((await view(QUEST, userName)).status).toBe(200);
      expect((await ticket(TICKET, userName)).status).toBe(201);
    }
    expect((await view(QUEST, "stranger")).status).toBe(404);
  });
});

describe("a public quest", () => {
  it("is the default, and can be followed by anyone", async () => {
    expect((await view("/api/v1/quests/open/spectator-view")).status).toBe(200);
    expect((await ticket("/api/v1/quests/open/live-tickets")).status).toBe(201);
  });

  it("counts a quest from before visibility as public", async () => {
    await QuestModel.collection.updateOne(
      { name: "open" },
      { $unset: { visibility: "" } }
    );

    expect((await view("/api/v1/quests/open/spectator-view")).status).toBe(200);
  });
});

describe("administrators", () => {
  const admin = (call: request.Test) =>
    call.set("Authorization", `Bearer ${sessions.boss}`);

  it("see a quest's visibility", async () => {
    const { text } = await admin(request(app).get("/api/v1/quests/secret"));

    expect(JSON.parse(text)).toMatchObject({ visibility: "private" });
  });

  it("can make a quest private, and public again", async () => {
    const open = "/api/v1/quests/open";
    await admin(request(app).patch(open))
      .send({ visibility: "private" })
      .expect(200);
    expect((await view(`${open}/spectator-view`)).status).toBe(404);

    await admin(request(app).patch(open))
      .send({ visibility: "public" })
      .expect(200);
    expect((await view(`${open}/spectator-view`)).status).toBe(200);
  });

  it("keep a quest's visibility when updating something else", async () => {
    await admin(request(app).patch("/api/v1/quests/secret"))
      .send({ displayName: "Renamed" })
      .expect(200);

    expect((await view(QUEST)).status).toBe(404);
  });

  it("are refused a visibility that doesn't exist", async () => {
    await admin(request(app).patch("/api/v1/quests/secret"))
      .send({ visibility: "hidden" })
      .expect(400);
  });
});

describe("those following it", () => {
  /** Follows a quest, resolving once the server has answered. */
  async function follow(questName: string): Promise<WebSocket> {
    const response = await ticket(`/api/v1/quests/${questName}/live-tickets`);
    const socket = new WebSocket(
      `ws://localhost:${String(port)}/api/v1/updates`
    );
    clients.push(socket);
    await new Promise((resolve) => socket.on("open", resolve));
    const answered = new Promise((resolve) => socket.once("message", resolve));
    socket.send(
      JSON.stringify({
        message: "subscribe",
        questName,
        ticket: (JSON.parse(response.text) as { ticket: string }).ticket,
      })
    );
    await answered;
    return socket;
  }

  const closed = (socket: WebSocket) =>
    new Promise((resolve) => socket.on("close", resolve));
  const update = (body: object, questName = "open") =>
    request(app)
      .patch(`/api/v1/quests/${questName}`)
      .set("Authorization", `Bearer ${sessions.boss}`)
      .send(body)
      .expect(200);

  it("are disconnected when it becomes private", async () => {
    const socket = await follow("open");
    const whenClosed = closed(socket);

    await update({ visibility: "private" });

    expect(await whenClosed).toBe(4001);
  });

  it("are disconnected when a private quest is reassigned", async () => {
    await update({ visibility: "private" });
    const { text } = await ticket("/api/v1/quests/open/live-tickets", "player");
    expect(JSON.parse(text)).toHaveProperty("ticket");
    const socket = new WebSocket(
      `ws://localhost:${String(port)}/api/v1/updates`
    );
    clients.push(socket);
    await new Promise((resolve) => socket.on("open", resolve));
    const answered = new Promise((resolve) => socket.once("message", resolve));
    socket.send(
      JSON.stringify({
        message: "subscribe",
        questName: "open",
        ticket: (JSON.parse(text) as { ticket: string }).ticket,
      })
    );
    await answered;
    const whenClosed = closed(socket);

    await update({ entrants: [{ kind: "user", name: "stranger" }] });

    expect(await whenClosed).toBe(4001);
  });

  it("stay connected for changes that don't affect who may follow", async () => {
    const socket = await follow("open");

    await update({ displayName: "Renamed" });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });
});
