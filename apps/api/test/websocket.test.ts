// The websocket server accepts connections from anyone, so messages it can't
// use must be ignored rather than stop the server.
import * as http from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import * as WebSocketService from "../src/services/websocket.service.js";

let server: http.Server;
let port: number;

beforeAll(async () => {
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
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function connect() {
  const socket = new WebSocket(`ws://localhost:${port}/api/v1/updates`);
  const messages: { message?: string }[] = [];
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await new Promise((resolve) => socket.on("open", resolve));
  return { socket, messages };
}

/** Connects a client following a quest, once the server has answered. */
async function follow(questName: string) {
  const client = await connect();
  client.socket.send(JSON.stringify({ message: "subscribe", questName }));
  await vi.waitFor(() =>
    expect(client.messages[0]?.message).toBe("connection")
  );
  client.messages.length = 0;
  return client;
}

const update = (questName: string) =>
  ({ message: "questUpdated", questName }) as const;

describe("websocket server", () => {
  it.each([
    ["text that isn't JSON", "not json"],
    ["JSON that isn't an object", "null"],
    ["a subscription with no quest", JSON.stringify({ message: "subscribe" })],
    [
      "a subscription with an empty quest",
      JSON.stringify({ message: "subscribe", questName: "" }),
    ],
    [
      "the old pages' message",
      JSON.stringify({ message: "init", url: "http://localhost/quest/q1" }),
    ],
  ])("ignores %s and keeps working", async (_description, payload) => {
    const { socket, messages } = await connect();
    socket.send(payload);

    // The server still accepts connections and subscriptions.
    const next = await follow("still-working");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(messages).toHaveLength(0);

    socket.close();
    next.socket.close();
  });

  it("refuses to send a message clients don't expect", async () => {
    const { socket, messages } = await follow("q5");

    // Missing the puzzle's name and solution, which clients need.
    expect(() =>
      WebSocketService.notifyQuestFollowers({
        message: "puzzleSolved",
        questName: "q5",
      } as never)
    ).toThrow(/puzzleName/);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(messages).toHaveLength(0);
    socket.close();
  });

  describe("following a quest", () => {
    it("sends the quest's updates to everyone following it", async () => {
      const clients = [await follow("follow-a"), await follow("follow-a")];

      WebSocketService.notifyQuestFollowers(update("follow-a"));

      await vi.waitFor(() =>
        clients.forEach(({ messages }) =>
          expect(messages).toEqual([update("follow-a")])
        )
      );
      clients.forEach(({ socket }) => socket.close());
    });

    it("sends nothing about another quest", async () => {
      const { socket, messages } = await follow("follow-b");

      WebSocketService.notifyQuestFollowers(update("follow-b0"));
      WebSocketService.notifyQuestFollowers(update("other"));

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(messages).toHaveLength(0);
      socket.close();
    });

    it("leaves out the connection an action came from", async () => {
      const acting = await connect();
      acting.socket.send(
        JSON.stringify({ message: "subscribe", questName: "follow-c" })
      );
      await vi.waitFor(() => expect(acting.messages).toHaveLength(1));
      const { connectionId } = acting.messages[0] as { connectionId: string };
      const other = await follow("follow-c");

      WebSocketService.notifyQuestFollowers(update("follow-c"), [connectionId]);

      await vi.waitFor(() => expect(other.messages).toHaveLength(1));
      expect(acting.messages).toHaveLength(1);
      acting.socket.close();
      other.socket.close();
    });

    it("follows only the quest named last", async () => {
      const client = await follow("follow-d");
      client.socket.send(
        JSON.stringify({ message: "subscribe", questName: "follow-e" })
      );
      await vi.waitFor(() => expect(client.messages).toHaveLength(1));
      client.messages.length = 0;

      WebSocketService.notifyQuestFollowers(update("follow-d"));
      WebSocketService.notifyQuestFollowers(update("follow-e"));

      await vi.waitFor(() =>
        expect(client.messages).toEqual([update("follow-e")])
      );
      client.socket.close();
    });
  });

  it("no longer answers at the old address", async () => {
    const socket = new WebSocket(`ws://localhost:${port}/api/updates`);

    const status = await new Promise((resolve) =>
      socket.on("unexpected-response", (_req, response) =>
        resolve(response.statusCode)
      )
    );

    expect(status).toBe(400);
  });
});
