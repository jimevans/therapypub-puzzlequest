// Following the list of quests a user plays, as their home screen does, so a
// quest appears there the moment a phone call or the puzzle master starts it.
// The message says only that the list changed, never which quest.
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
import WebSocket from "ws";
import { startSessions } from "../sessions.js";

const { createApp } = await import("../../src/createApp.js");
const { subscribeQuestEventHandlers } =
  await import("../../src/events/subscribers.js");
const { LiveTicketModel } =
  await import("../../src/models/liveTicket.model.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { AuthorizationLevel, TeamModel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const TeamService = await import("../../src/services/team.service.js");
const UserService = await import("../../src/services/user.service.js");
const WebSocketService =
  await import("../../src/services/websocket.service.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let server: http.Server;
let port: number;
let sessions: Record<string, string> = {};
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
    TeamModel.deleteMany({}),
    PuzzleModel.deleteMany({}),
    QuestModel.deleteMany({}),
    LiveTicketModel.deleteMany({}),
  ]);
  await UserModel.create(
    ["player", "teammate", "other"].map((userName) => ({
      userName,
      displayName: userName,
      email: `${userName}@example.com`,
      password: "hash",
    }))
  );
  await UserModel.create({
    userName: "admin",
    displayName: "Admin",
    email: "admin@example.com",
    password: "hash",
    authorizationLevel: AuthorizationLevel.ADMIN,
  });
  const teammate = await UserModel.findOne({ userName: "teammate" }).lean();
  await TeamModel.create({
    teamName: "the-team",
    displayName: "The Team",
    joinCode: "join-code",
    memberIds: [teammate!._id],
  });
  await PuzzleModel.create({
    name: "riddle",
    displayName: "Riddle",
    solutionKeyword: "pianokeyword",
    solutionDisplayText: "A piano",
  });
  for (const [name, assignee] of [
    ["mine", { kind: "user", name: "player" }],
    ["theirs", { kind: "user", name: "other" }],
    ["the-teams", { kind: "team", name: "the-team" }],
  ] as const) {
    await QuestService.createQuest({
      name,
      displayName: name,
      entrants: [assignee],
      puzzles: [{ puzzleName: "riddle", activationCode: `${name}-code` }],
    });
  }
  sessions = await startSessions("player", "teammate", "other", "admin");
});

afterEach(() => {
  clients.forEach((client) => client.terminate());
  clients = [];
});

function ticketFor(userName: string, as = userName) {
  return request(app)
    .post(`/api/v1/users/${userName}/live-tickets`)
    .set("Authorization", `Bearer ${sessions[as]}`);
}

/** Subscribes, and says what the server answered. */
async function subscribe(
  subscription: object
): Promise<{ answer: "connected" | number; messages: string[] }> {
  const socket = new WebSocket(`ws://localhost:${String(port)}/api/v1/updates`);
  clients.push(socket);
  await new Promise((resolve) => socket.on("open", resolve));
  const messages: string[] = [];
  const answer = new Promise<"connected" | number>((resolve) => {
    socket.on("message", (data) => {
      messages.push(JSON.parse(data.toString()).message as string);
      resolve("connected");
    });
    socket.on("close", resolve);
  });
  socket.send(JSON.stringify({ message: "subscribe", ...subscription }));
  const answered = await answer;
  messages.length = 0;
  return { answer: answered, messages };
}

/** Follows a user's quests with a ticket of their own. */
async function followUser(userName: string): Promise<string[]> {
  const { body } = await ticketFor(userName).expect(201);
  const { answer, messages } = await subscribe({
    userName,
    ticket: (body as { ticket: string }).ticket,
  });
  expect(answer).toBe("connected");
  return messages;
}

/** Waits long enough for a message that shouldn't come. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

describe("getting a ticket for a user's quests", () => {
  it("gives a user one for themselves", async () => {
    const response = await ticketFor("player").expect(201);

    expect(response.body).toEqual({
      ticket: expect.any(String),
      expiresAt: expect.any(String),
    });
  });

  it("gives an administrator one for anyone", async () => {
    await ticketFor("player", "admin").expect(201);
  });

  it("refuses one for someone else", async () => {
    await ticketFor("player", "other").expect(403);
  });

  it("refuses one to someone signed out", async () => {
    await request(app).post("/api/v1/users/player/live-tickets").expect(401);
  });
});

describe("subscribing with a user's ticket", () => {
  it("refuses it for another user", async () => {
    const { body } = await ticketFor("player").expect(201);

    const { answer } = await subscribe({
      userName: "other",
      ticket: body.ticket,
    });

    expect(answer).toBe(1008);
  });

  it("refuses it for a quest, and a quest's ticket for a user", async () => {
    const { body: userTicket } = await ticketFor("player").expect(201);
    const { body: questTicket } = await request(app)
      .post("/api/v1/quests/mine/live-tickets")
      .expect(201);

    expect(
      (await subscribe({ questName: "mine", ticket: userTicket.ticket })).answer
    ).toBe(1008);
    expect(
      (await subscribe({ userName: "player", ticket: questTicket.ticket }))
        .answer
    ).toBe(1008);
  });
});

describe("a user's quests changing", () => {
  it("tells them when the puzzle master starts their quest", async () => {
    const player = await followUser("player");
    const other = await followUser("other");

    await request(app)
      .post("/api/v1/quests/mine/start")
      .set("Authorization", `Bearer ${sessions.admin}`)
      .expect(200);

    await vi.waitFor(() => expect(player).toEqual(["questsChanged"]));
    await settle();
    expect(other).toEqual([]);
  });

  it("tells every member when their team's quest moves on", async () => {
    await QuestService.startQuest("the-teams");
    const teammate = await followUser("teammate");
    const player = await followUser("player");

    await request(app)
      .post("/api/v1/quests/the-teams/puzzles/riddle/activation")
      .set("Authorization", `Bearer ${sessions.teammate}`)
      .send({ activationCode: "the-teams-code" })
      .expect(200);

    await vi.waitFor(() => expect(teammate).toEqual(["questsChanged"]));
    await settle();
    expect(player).toEqual([]);
  });

  it("tells both players when a quest is reassigned", async () => {
    const player = await followUser("player");
    const other = await followUser("other");

    await QuestService.updateQuest({
      name: "mine",
      entrants: [{ kind: "user", name: "other" }],
    });

    await vi.waitFor(() => {
      expect(player).toEqual(["questsChanged"]);
      expect(other).toEqual(["questsChanged"]);
    });
  });

  it("tells them when their quest is deleted", async () => {
    const player = await followUser("player");

    await QuestService.deleteQuest("mine");

    await vi.waitFor(() => expect(player).toEqual(["questsChanged"]));
  });

  it("tells them when they join or leave a team", async () => {
    const player = await followUser("player");

    await TeamService.joinTeamByCode("player", "join-code");
    await vi.waitFor(() => expect(player).toEqual(["questsChanged"]));
    await TeamService.removeUserFromTeam("the-team", "player");

    await vi.waitFor(() =>
      expect(player).toEqual(["questsChanged", "questsChanged"])
    );
  });

  it("tells a team's members when it's deleted", async () => {
    const teammate = await followUser("teammate");

    await TeamService.deleteTeam("the-team");

    await vi.waitFor(() => expect(teammate).toEqual(["questsChanged"]));
  });

  it("cuts off a deleted user", async () => {
    const { body } = await ticketFor("other").expect(201);
    const socket = new WebSocket(
      `ws://localhost:${String(port)}/api/v1/updates`
    );
    clients.push(socket);
    await new Promise((resolve) => socket.on("open", resolve));
    const connected = new Promise((resolve) => socket.on("message", resolve));
    socket.send(
      JSON.stringify({
        message: "subscribe",
        userName: "other",
        ticket: body.ticket,
      })
    );
    await connected;
    const closed = new Promise((resolve) =>
      socket.on("close", (code) => resolve(code))
    );

    await UserService.deleteUser("other");

    expect(await closed).toBe(4001);
  });
});
