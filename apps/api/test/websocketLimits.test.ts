// Anyone can open the live-update websocket, so what one client can use of it
// is limited. A venue's phones and screens share a network address, which is
// why the limit per address is generous.
import * as http from "http";
import type { AddressInfo } from "net";
import proxyaddr from "proxy-addr";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import * as WebSocketService from "../src/services/websocket.service.js";
import { recordLogs } from "./logs.js";

const LIMITS: WebSocketService.LiveUpdateLimits = {
  maxMessageBytes: 64,
  maxConnections: 4,
  maxConnectionsPerAddress: 2,
  maxMessagesPerMinute: 3,
  subscribeWithinMs: 100,
};
const NOT_BEHIND_A_PROXY = () => false;
const BEHIND_A_LOCAL_PROXY = proxyaddr.compile("loopback");
const SUBSCRIBE = JSON.stringify({ message: "subscribe", questName: "q" });

let server: http.Server | undefined;
let port = 0;
let sockets: WebSocket[] = [];

async function start(
  trust: Parameters<typeof WebSocketService.attachToServer>[2],
  limits = LIMITS
): Promise<void> {
  const socketServer = WebSocketService.initialize(limits);
  server = http.createServer();
  WebSocketService.attachToServer(server, socketServer, trust, limits);
  await new Promise<void>((resolve) => server?.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
}

afterEach(async () => {
  sockets.forEach((socket) => socket.terminate());
  sockets = [];
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve));
});

/** Opens a connection, and resolves with its status if it's refused. */
function open(forwardedFor?: string) {
  const socket = new WebSocket(
    `ws://localhost:${String(port)}/api/v1/updates`,
    {
      headers: forwardedFor ? { "X-Forwarded-For": forwardedFor } : {},
    }
  );
  sockets.push(socket);
  const outcome = new Promise<number | "open">((resolve) => {
    socket.on("open", () => resolve("open"));
    socket.on("unexpected-response", (_request, response) =>
      resolve(response.statusCode ?? 0)
    );
    socket.on("error", () => undefined);
  });
  return { socket, outcome };
}

/** Waits for a connection to be closed, with the code it was closed with. */
function closed(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.on("close", resolve));
}

describe("connections", () => {
  it("refuses more than the limit from one address, and logs it", async () => {
    await start(NOT_BEHIND_A_PROXY);
    expect(await open().outcome).toBe("open");
    expect(await open().outcome).toBe("open");

    const logs = recordLogs();
    expect(await open().outcome).toBe(429);
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: "warn",
        event: "live-update-refused",
        reason: "too-many-from-address",
      })
    );
  });

  it("makes room when a connection closes", async () => {
    await start(NOT_BEHIND_A_PROXY);
    const first = open();
    await first.outcome;
    await open().outcome;

    first.socket.close();
    await closed(first.socket);

    await vi.waitFor(async () => {
      expect(await open().outcome).toBe("open");
    });
  });

  it("counts each client behind a trusted proxy separately", async () => {
    await start(BEHIND_A_LOCAL_PROXY);

    expect(await open("203.0.113.1").outcome).toBe("open");
    expect(await open("203.0.113.1").outcome).toBe("open");
    expect(await open("203.0.113.2").outcome).toBe("open");
    expect(await open("203.0.113.1").outcome).toBe(429);
  });

  it("doesn't believe a client's forwarded address without a proxy", async () => {
    await start(NOT_BEHIND_A_PROXY);

    expect(await open("203.0.113.1").outcome).toBe("open");
    expect(await open("203.0.113.2").outcome).toBe("open");
    expect(await open("203.0.113.3").outcome).toBe(429);
  });

  it("refuses more than the total, whatever the address", async () => {
    await start(BEHIND_A_LOCAL_PROXY);
    for (const address of ["1", "2", "3", "4"]) {
      expect(await open(`203.0.113.${address}`).outcome).toBe("open");
    }

    const logs = recordLogs();
    expect(await open("203.0.113.5").outcome).toBe(503);
    expect(logs).toContainEqual(
      expect.objectContaining({ reason: "too-many-connections" })
    );
  });
});

describe("what a connection may send", () => {
  it("closes a connection sending too large a message", async () => {
    await start(NOT_BEHIND_A_PROXY);
    const { socket, outcome } = open();
    await outcome;

    socket.send("x".repeat(65));

    expect(await closed(socket)).toBe(1009);
  });

  it("closes a connection sending too many messages, and logs it", async () => {
    await start(NOT_BEHIND_A_PROXY);
    const { socket, outcome } = open();
    await outcome;
    const whenClosed = closed(socket);
    const logs = recordLogs();

    for (let sent = 0; sent < 4; sent++) {
      socket.send(SUBSCRIBE);
    }

    expect(await whenClosed).toBe(1008);
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: "live-update-refused",
        reason: "too-many-messages",
      })
    );
  });

  it("closes a connection that doesn't subscribe in time", async () => {
    await start(NOT_BEHIND_A_PROXY);
    const { socket, outcome } = open();
    await outcome;

    expect(await closed(socket)).toBe(1008);
  });

  it("isn't satisfied by a message that isn't a subscription", async () => {
    await start(NOT_BEHIND_A_PROXY);
    const { socket, outcome } = open();
    await outcome;

    socket.send("not json");

    expect(await closed(socket)).toBe(1008);
  });

  it("keeps a connection that subscribes in time", async () => {
    await start(NOT_BEHIND_A_PROXY);
    const { socket, outcome } = open();
    await outcome;

    socket.send(SUBSCRIBE);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });
});
