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

describe("websocket server", () => {
  it.each([
    ["text that isn't JSON", "not json"],
    ["JSON that isn't an object", "null"],
    ["an init message without a URL", JSON.stringify({ message: "init" })],
    [
      "an init message with an invalid URL",
      JSON.stringify({ message: "init", url: "not a url" }),
    ],
  ])("ignores %s and keeps working", async (_description, payload) => {
    const { socket } = await connect();
    socket.send(payload);

    // The server still accepts connections and registers pages.
    const { socket: next, messages } = await connect();
    next.send(
      JSON.stringify({ message: "init", url: "http://localhost/quest/q1" })
    );
    await vi.waitFor(() => expect(messages[0]?.message).toBe("connection"));

    socket.close();
    next.close();
  });

  it("notifies browsers showing the page", async () => {
    const { socket, messages } = await connect();
    socket.send(
      JSON.stringify({ message: "init", url: "http://localhost/quest/q2" })
    );
    await vi.waitFor(() => expect(messages).toHaveLength(1));

    const update = { message: "questUpdated", questName: "q2" } as const;
    WebSocketService.notifyBrowsers(["/quest/q2"], [], update);

    await vi.waitFor(() => expect(messages[1]).toEqual(update));
    socket.close();
  });

  it("ignores a page's message that isn't a valid init", async () => {
    const { socket, messages } = await connect();
    for (const message of [
      "not JSON",
      JSON.stringify({ message: "init" }),
      JSON.stringify({ message: "init", url: "not a URL" }),
      JSON.stringify({
        message: "subscribe",
        url: "http://localhost/quest/q4",
      }),
    ]) {
      socket.send(message);
    }
    socket.send(
      JSON.stringify({ message: "init", url: "http://localhost/quest/q4" })
    );

    // Only the valid init was answered.
    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(messages[0].message).toBe("connection");
    socket.close();
  });

  it("refuses to send a message the pages don't expect", async () => {
    const { socket, messages } = await connect();
    socket.send(
      JSON.stringify({ message: "init", url: "http://localhost/quest/q5" })
    );
    await vi.waitFor(() => expect(messages).toHaveLength(1));

    // Missing the quest's name, which the pages need.
    expect(() =>
      WebSocketService.notifyQuestPages({
        message: "questUpdated",
      } as never)
    ).toThrow(/questName/);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(messages).toHaveLength(1);
    socket.close();
  });

  it("notifies every page of a quest, and only that quest", async () => {
    const pages = [
      "/quest/q3",
      "/quest/q3/puzzle/p1",
      "/monitor/quest/q3",
      "/monitor/quest/q3/puzzle/p1",
      "/quest/q30",
      "/quest/other",
    ];
    const browsers = await Promise.all(pages.map(() => connect()));
    browsers.forEach(({ socket }, index) =>
      socket.send(
        JSON.stringify({
          message: "init",
          url: `http://localhost${pages[index]}`,
        })
      )
    );
    await vi.waitFor(() =>
      browsers.forEach(({ messages }) => expect(messages).toHaveLength(1))
    );

    WebSocketService.notifyQuestPages({
      message: "questUpdated",
      questName: "q3",
    });

    await vi.waitFor(() =>
      browsers.slice(0, 4).forEach(({ messages }) =>
        expect(messages[1]).toEqual({
          message: "questUpdated",
          questName: "q3",
        })
      )
    );
    // The others only ever got their connection message.
    browsers
      .slice(4)
      .forEach(({ messages }) => expect(messages).toHaveLength(1));
    browsers.forEach(({ socket }) => socket.close());
  });

  describe("following a quest", () => {
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

    it("sends every update of that quest, whichever pages it's meant for", async () => {
      const { socket, messages } = await follow("follow-a");

      WebSocketService.notifyBrowsers(
        ["/quest/elsewhere"],
        [],
        update("follow-a")
      );
      WebSocketService.notifyQuestPages(update("follow-a"));

      await vi.waitFor(() => expect(messages).toHaveLength(2));
      socket.close();
    });

    it("sends nothing about another quest", async () => {
      const { socket, messages } = await follow("follow-b");

      WebSocketService.notifyBrowsers([], [], update("follow-b0"));
      WebSocketService.notifyQuestPages(update("other"));

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

      WebSocketService.notifyBrowsers([], [connectionId], update("follow-c"));

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

      WebSocketService.notifyQuestPages(update("follow-d"));
      WebSocketService.notifyQuestPages(update("follow-e"));

      await vi.waitFor(() =>
        expect(client.messages).toEqual([update("follow-e")])
      );
      client.socket.close();
    });

    it("sends an update once to a client matched both ways", async () => {
      const client = await follow("follow-f");
      client.socket.send(
        JSON.stringify({
          message: "init",
          url: "http://localhost/quest/follow-f",
        })
      );
      await vi.waitFor(() => expect(client.messages).toHaveLength(1));
      client.messages.length = 0;

      WebSocketService.notifyBrowsers(
        ["/quest/follow-f"],
        [],
        update("follow-f")
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(client.messages).toHaveLength(1);
      client.socket.close();
    });

    it("ignores a subscription without a quest's name", async () => {
      const { socket, messages } = await connect();
      socket.send(JSON.stringify({ message: "subscribe" }));
      socket.send(JSON.stringify({ message: "subscribe", questName: "" }));

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(messages).toHaveLength(0);
      socket.close();
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
