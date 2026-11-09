// Share links: who can manage them, and what holding one lets someone do.
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
import WebSocket from "ws";
import { QuestPuzzleStatus } from "../../src/domain/quest/state.js";
import { startSessions } from "../sessions.js";

const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { ShareLinkModel } = await import("../../src/models/shareLink.model.js");
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

const LINKS = "/api/v1/quests/secret/share-links";
const QUEST = "/api/v1/quests/secret/spectator-view";
const PUZZLE = "/api/v1/quests/secret/puzzles/riddle/spectator-view";
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
    displayName: `${userName} name`,
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
    ShareLinkModel.deleteMany({}),
  ]);
  const one = await createUser("one");
  const two = await createUser("two");
  await createUser("stranger");
  await createUser("helper", AuthorizationLevel.STAFF);
  await TeamModel.create({
    teamName: "reds",
    displayName: "Reds",
    joinCode: "join",
    memberIds: [one._id, two._id],
  });
  await PuzzleModel.create({
    name: "riddle",
    displayName: "Riddle",
    solutionKeyword: "piano",
    solutionDisplayText: "A piano",
  });
  for (const name of ["secret", "elsewhere"]) {
    await QuestService.createQuest({
      name,
      displayName: name,
      visibility: "private",
      assignee: { kind: "team", name: "reds" },
      puzzles: [{ puzzleName: "riddle", activationCode: `${name}-code` }],
    });
  }
  await QuestModel.updateOne(
    { name: "secret" },
    { "puzzles.0.status": QuestPuzzleStatus.IN_PROGRESS }
  );
  sessions = await startSessions("one", "two", "stranger", "helper");
});

afterEach(() => {
  clients.forEach((client) => client.terminate());
  clients = [];
});

const as = (call: request.Test, userName: string) =>
  call.set("Authorization", `Bearer ${sessions[userName]}`);

async function makeLink(userName = "one", label = "Grandma") {
  const response = await as(request(app).post(LINKS), userName).send({ label });
  expect(response.status).toBe(201);
  return JSON.parse(response.text) as {
    id: string;
    token: string;
    expiresAt: string;
  };
}

const holding = (call: request.Test, token: string) =>
  call.set("X-Share-Token", token);

describe("making a link", () => {
  it("is open to any member of the team, and to staff", async () => {
    await makeLink("one");
    await makeLink("two");
    await makeLink("helper");

    expect(await ShareLinkModel.countDocuments()).toBe(3);
  });

  it("isn't open to anyone else, who finds no such quest", async () => {
    const response = await as(request(app).post(LINKS), "stranger").send({
      label: "Mine",
    });

    expect(response.status).toBe(404);
  });

  it("expires in 30 days, and stores only the token's hash", async () => {
    const { token, expiresAt } = await makeLink();

    const days = (Date.parse(expiresAt) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    const stored = await ShareLinkModel.findOne({}).lean();
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("lets staff choose when it expires", async () => {
    const expiresAt = new Date(Date.now() + 86400000).toISOString();

    const response = await as(request(app).post(LINKS), "helper").send({
      label: "Lobby",
      expiresAt,
    });

    expect(JSON.parse(response.text)).toMatchObject({ expiresAt });
  });

  it("doesn't let a player choose", async () => {
    const response = await as(request(app).post(LINKS), "one").send({
      label: "Lobby",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    expect(response.status).toBe(403);
  });

  it.each([
    ["a date in the past", { expiresAt: "2020-01-01T00:00:00.000Z" }],
    ["a date years away", { expiresAt: "2099-01-01T00:00:00.000Z" }],
    ["an empty label", { label: "  " }],
  ])("refuses %s", async (_description, change) => {
    const response = await as(request(app).post(LINKS), "helper").send({
      label: "Lobby",
      ...change,
    });

    expect(response.status).toBe(400);
  });
});

describe("the list of links", () => {
  it("shows who made each, and never a token", async () => {
    const { token } = await makeLink("one");

    const response = await as(request(app).get(LINKS), "two");

    expect(response.text).not.toContain(token);
    expect(JSON.parse(response.text)).toMatchObject({
      visibility: "private",
      canSetExpiry: false,
      links: [{ label: "Grandma", createdBy: "one name", canRevoke: false }],
    });
  });

  it("says who may revoke, and that staff may set expiry", async () => {
    await makeLink("one");

    const asMaker = await as(request(app).get(LINKS), "one");
    const asStaff = await as(request(app).get(LINKS), "helper");

    expect(JSON.parse(asMaker.text).links[0].canRevoke).toBe(true);
    expect(JSON.parse(asStaff.text)).toMatchObject({
      canSetExpiry: true,
      links: [{ canRevoke: true }],
    });
  });

  it("isn't shown to anyone else", async () => {
    expect((await as(request(app).get(LINKS), "stranger")).status).toBe(404);
  });
});

describe("holding a link", () => {
  it("lets someone without an account follow the quest", async () => {
    const { token } = await makeLink();

    expect((await holding(request(app).get(QUEST), token)).status).toBe(200);
    expect((await holding(request(app).get(PUZZLE), token)).status).toBe(200);
    expect((await holding(request(app).post(TICKET), token)).status).toBe(201);
  });

  it("works for no other quest", async () => {
    const { token } = await makeLink();

    const response = await holding(
      request(app).get("/api/v1/quests/elsewhere/spectator-view"),
      token
    );

    expect(response.status).toBe(404);
  });

  it("is refused once expired", async () => {
    const { token } = await makeLink();
    await ShareLinkModel.updateMany(
      {},
      { expiresAt: new Date(Date.now() - 1000) }
    );

    expect((await holding(request(app).get(QUEST), token)).status).toBe(404);
  });

  it("is refused with a made-up token", async () => {
    expect((await holding(request(app).get(QUEST), "nope")).status).toBe(404);
  });

  it("is removed with its quest", async () => {
    await makeLink();

    await QuestService.deleteQuest("secret");

    expect(await ShareLinkModel.countDocuments()).toBe(0);
  });
});

describe("revoking a link", () => {
  const revoke = (id: string, userName: string) =>
    as(request(app).delete(`${LINKS}/${id}`), userName);

  async function followThrough(token: string): Promise<WebSocket> {
    const response = await holding(request(app).post(TICKET), token);
    const socket = new WebSocket(
      `ws://localhost:${String(port)}/api/v1/updates`
    );
    clients.push(socket);
    await new Promise((resolve) => socket.on("open", resolve));
    const answered = new Promise((resolve) => socket.once("message", resolve));
    socket.send(
      JSON.stringify({
        message: "subscribe",
        questName: "secret",
        ticket: (JSON.parse(response.text) as { ticket: string }).ticket,
      })
    );
    await answered;
    return socket;
  }

  it("is open to its maker, and it stops working", async () => {
    const { id, token } = await makeLink("one");

    expect((await revoke(id, "one")).status).toBe(204);

    expect((await holding(request(app).get(QUEST), token)).status).toBe(404);
  });

  it("is open to staff", async () => {
    const { id } = await makeLink("one");

    expect((await revoke(id, "helper")).status).toBe(204);
  });

  it("isn't open to a teammate who didn't make it", async () => {
    const { id, token } = await makeLink("one");

    expect((await revoke(id, "two")).status).toBe(403);
    expect((await holding(request(app).get(QUEST), token)).status).toBe(200);
  });

  it("isn't open to anyone else, who finds no such quest", async () => {
    const { id } = await makeLink("one");

    expect((await revoke(id, "stranger")).status).toBe(404);
  });

  it("is not found for a link that doesn't exist", async () => {
    expect((await revoke("not-an-id", "helper")).status).toBe(404);
  });

  it("cuts off those following through it, and only them", async () => {
    const first = await makeLink("one", "First");
    const second = await makeLink("one", "Second");
    const cutOff = await followThrough(first.token);
    const other = await followThrough(second.token);
    const whenClosed = new Promise((resolve) => cutOff.on("close", resolve));

    await revoke(first.id, "one");

    expect(await whenClosed).toBe(4001);
    expect(other.readyState).toBe(WebSocket.OPEN);
  });
});
