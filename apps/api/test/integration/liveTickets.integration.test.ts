// Tickets for following a quest over the live-update websocket: from the API
// to a subscription, which is how a client of any kind proves what it may see.
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
import { recordLogs } from "../logs.js";

const { createApp } = await import("../../src/createApp.js");
const { LiveTicketModel } =
  await import("../../src/models/liveTicket.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { UserModel } = await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const WebSocketService =
  await import("../../src/services/websocket.service.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let server: http.Server;
let port: number;
let clients: WebSocket[] = [];

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

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    QuestModel.deleteMany({}),
    LiveTicketModel.deleteMany({}),
  ]);
  await UserModel.create({
    userName: "player",
    displayName: "Player",
    email: "player@example.com",
    password: "hash",
  });
  for (const name of ["quest", "other"]) {
    await QuestService.createQuest({
      name,
      displayName: name,
      entrants: [{ kind: "user", name: "player" }],
      puzzles: [],
    });
  }
});

afterEach(() => {
  clients.forEach((client) => client.terminate());
  clients = [];
});

async function getTicket(questName = "quest"): Promise<string> {
  const response = await request(app).post(
    `/api/v1/quests/${questName}/live-tickets`
  );
  expect(response.status).toBe(201);
  return (JSON.parse(response.text) as { ticket: string }).ticket;
}

/** Subscribes, and says what the server answered. */
async function subscribe(
  questName: string,
  ticket?: string
): Promise<{ answer: "connected" | number; socket: WebSocket }> {
  const socket = new WebSocket(`ws://localhost:${String(port)}/api/v1/updates`);
  clients.push(socket);
  await new Promise((resolve) => socket.on("open", resolve));
  const answer = new Promise<"connected" | number>((resolve) => {
    socket.on("message", () => resolve("connected"));
    socket.on("close", resolve);
  });
  socket.send(JSON.stringify({ message: "subscribe", questName, ticket }));
  return { answer: await answer, socket };
}

describe("getting a ticket", () => {
  it("gives anyone one for a quest, expiring within a minute", async () => {
    const before = Date.now();
    const response = await request(app).post(
      "/api/v1/quests/quest/live-tickets"
    );

    expect(response.status).toBe(201);
    const { ticket, expiresAt } = JSON.parse(response.text) as {
      ticket: string;
      expiresAt: string;
    };
    expect(ticket.length).toBeGreaterThanOrEqual(43);
    expect(Date.parse(expiresAt) - before).toBeLessThanOrEqual(61000);
  });

  it("stores only the ticket's hash", async () => {
    const ticket = await getTicket();

    const stored = await LiveTicketModel.findOne({}).lean();
    expect(stored?.tokenHash).toBeDefined();
    expect(JSON.stringify(stored)).not.toContain(ticket);
  });

  it("is not found for a quest that doesn't exist", async () => {
    const response = await request(app).post(
      "/api/v1/quests/nothing/live-tickets"
    );

    expect(response.status).toBe(404);
    expect(await LiveTicketModel.countDocuments()).toBe(0);
  });
});

describe("subscribing with a ticket", () => {
  it("follows the quest", async () => {
    const { answer } = await subscribe("quest", await getTicket());

    expect(answer).toBe("connected");
  });

  it("uses the ticket up", async () => {
    const ticket = await getTicket();
    await subscribe("quest", ticket);

    expect((await subscribe("quest", ticket)).answer).toBe(1008);
  });

  it("refuses a ticket for another quest, and logs it", async () => {
    const ticket = await getTicket("other");
    const logs = recordLogs();

    expect((await subscribe("quest", ticket)).answer).toBe(1008);
    await vi.waitFor(() =>
      expect(logs).toContainEqual(
        expect.objectContaining({
          event: "live-update-refused",
          reason: "invalid-ticket",
        })
      )
    );
  });

  it("refuses a ticket that has expired", async () => {
    const ticket = await getTicket();
    await LiveTicketModel.updateMany(
      {},
      { expiresAt: new Date(Date.now() - 1000) }
    );

    expect((await subscribe("quest", ticket)).answer).toBe(1008);
  });

  it("refuses a made-up ticket", async () => {
    expect((await subscribe("quest", "made-up")).answer).toBe(1008);
  });

  it("ignores a subscription with no ticket", async () => {
    const socket = new WebSocket(
      `ws://localhost:${String(port)}/api/v1/updates`
    );
    clients.push(socket);
    await new Promise((resolve) => socket.on("open", resolve));
    const messages: unknown[] = [];
    socket.on("message", (data) => messages.push(data));

    socket.send(JSON.stringify({ message: "subscribe", questName: "quest" }));

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(messages).toEqual([]);
  });
});
