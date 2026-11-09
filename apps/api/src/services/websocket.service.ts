import { randomUUID } from "crypto";
import type { Server } from "http";
import type { Duplex } from "stream";
import { ipKeyGenerator } from "express-rate-limit";
import proxyaddr from "proxy-addr";
import { type WebSocket, WebSocketServer } from "ws";
import { log } from "../logger.js";
import {
  type LiveUpdate,
  type QuestUpdate,
  liveUpdateSchema,
  type LiveUpdateSubscription,
  liveUpdateSubscriptionSchema,
} from "../schemas/liveUpdates.js";
import { redeemLiveTicket } from "./liveTicket.service.js";

/** A client connected for live updates. */
interface WebSocketSession {
  /** The connection's ID, which the client sends back with its requests. */
  id: string;
  socket: WebSocket;
  /** The quest the client follows, once it has sent "subscribe". */
  questName?: string;
  /** The share link it follows through, if any. */
  shareLinkId?: string;
}

const webSocketSessions = new Map<string, WebSocketSession>();

/** What one client, and all of them together, may use of the websocket. */
export interface LiveUpdateLimits {
  /** The largest message a client may send. */
  maxMessageBytes: number;
  /** Connections at once, from everyone. */
  maxConnections: number;
  /**
   * Connections at once from one network address. Generous, because the phones
   * and screens at a venue share an address.
   */
  maxConnectionsPerAddress: number;
  /** Messages a connection may send in a minute. */
  maxMessagesPerMinute: number;
  /** How long a new connection has to subscribe. */
  subscribeWithinMs: number;
}

export const DEFAULT_LIMITS: LiveUpdateLimits = {
  maxMessageBytes: 1024,
  maxConnections: 1000,
  maxConnectionsPerAddress: 100,
  maxMessagesPerMinute: 30,
  subscribeWithinMs: 10000,
};

const ONE_MINUTE = 60 * 1000;

/** The websocket close code for breaking the rules of the connection. */
const POLICY_VIOLATION = 1008;

/** The websocket close code for having to subscribe again (a private code). */
const SUBSCRIBE_AGAIN = 4001;

/** The websocket close code for the server failing to do something. */
const INTERNAL_ERROR = 1011;

/** Records that a client went over a limit; never says who it was. */
function logRefused(reason: string): void {
  log().warn({ event: "live-update-refused", reason }, "live update refused");
}

/**
 * Initializes the websocket server to be used in the application.
 * @param limits what a client may use of it
 * @returns the instance of the websocket server created
 */
export function initialize(
  limits: LiveUpdateLimits = DEFAULT_LIMITS
): WebSocketServer {
  const socketServer = new WebSocketServer({
    noServer: true,
    path: "/api/v1/updates",
    maxPayload: limits.maxMessageBytes,
  });
  socketServer.on("connection", (socket) => {
    const connectionId = randomUUID().replaceAll("-", "");
    webSocketSessions.set(connectionId, { id: connectionId, socket });
    const subscribeDeadline = setTimeout(() => {
      logRefused("did-not-subscribe");
      socket.close(POLICY_VIOLATION, "Subscribe to a quest");
    }, limits.subscribeWithinMs);
    subscribeDeadline.unref();
    let minuteStarted = Date.now();
    let messagesThisMinute = 0;
    let latestSubscription = 0;
    socket.on("error", (err) => {
      log().warn({ err }, "live-update connection error");
    });
    socket.on("message", (data) => {
      if (Date.now() - minuteStarted >= ONE_MINUTE) {
        minuteStarted = Date.now();
        messagesThisMinute = 0;
      }
      if (++messagesThisMinute > limits.maxMessagesPerMinute) {
        if (socket.readyState === socket.OPEN) {
          logRefused("too-many-messages");
          socket.close(POLICY_VIOLATION, "Too many messages");
        }
        return;
      }
      // Anyone can connect, so ignore anything that isn't a valid message; an
      // exception here would stop the whole server.
      let received: unknown;
      try {
        received = JSON.parse(data.toString());
      } catch {
        return;
      }
      const clientMessage = liveUpdateSubscriptionSchema.safeParse(received);
      if (!clientMessage.success) {
        return;
      }
      subscribe(clientMessage.data).catch((err: unknown) => {
        log().error({ err }, "live-update subscription failed");
        socket.close(INTERNAL_ERROR, "Try again");
      });
    });

    /** Follows a quest, if the subscription's ticket allows it. */
    async function subscribe({
      questName,
      ticket,
    }: LiveUpdateSubscription): Promise<void> {
      const thisSubscription = ++latestSubscription;
      const admitted = await redeemLiveTicket(ticket, questName);
      if (!admitted) {
        if (socket.readyState === socket.OPEN) {
          logRefused("invalid-ticket");
          socket.close(POLICY_VIOLATION, "Invalid ticket");
        }
        return;
      }
      if (
        thisSubscription !== latestSubscription ||
        socket.readyState !== socket.OPEN
      ) {
        return;
      }
      clearTimeout(subscribeDeadline);
      send(socket, { message: "connection", connectionId });
      const session = webSocketSessions.get(connectionId);
      if (session) {
        session.questName = questName;
        session.shareLinkId = admitted.shareLinkId;
      }
    }

    socket.on("close", () => {
      clearTimeout(subscribeDeadline);
      webSocketSessions.delete(connectionId);
    });
  });
  return socketServer;
}

/**
 * Answers a request to connect with a refusal.
 * @param socket the connection asking
 * @param status the HTTP status line's code and text
 * @param reason why, for the log
 */
function refuse(socket: Duplex, status: string, reason: string): void {
  logRefused(reason);
  // Past the HTTP server's handling, nothing else would catch a write to a
  // client that has gone, and an uncaught error stops the server.
  socket.on("error", () => undefined);
  socket.end(
    `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`
  );
}

/**
 * Accepts live-update connections on a server, within the limits.
 * @param server the HTTP server
 * @param socketServer the websocket server, from initialize()
 * @param trust which proxies to believe about a client's address: the Express
 *  application's "trust proxy fn", since an upgrade request has no req.ip
 * @param limits what clients may use
 */
export function attachToServer(
  server: Server,
  socketServer: WebSocketServer,
  trust: Parameters<typeof proxyaddr>[1],
  limits: LiveUpdateLimits = DEFAULT_LIMITS
): void {
  const connectionsByAddress = new Map<string, number>();
  let connections = 0;

  server.on("upgrade", (req, socket, header) => {
    const address = ipKeyGenerator(proxyaddr(req as never, trust));
    const fromAddress = connectionsByAddress.get(address) ?? 0;
    if (connections >= limits.maxConnections) {
      refuse(socket, "503 Service Unavailable", "too-many-connections");
      return;
    }
    if (fromAddress >= limits.maxConnectionsPerAddress) {
      refuse(socket, "429 Too Many Requests", "too-many-from-address");
      return;
    }
    socketServer.handleUpgrade(req, socket, header, (ws) => {
      connections++;
      connectionsByAddress.set(
        address,
        (connectionsByAddress.get(address) ?? 0) + 1
      );
      ws.on("close", () => {
        connections--;
        const remaining = (connectionsByAddress.get(address) ?? 1) - 1;
        if (remaining > 0) {
          connectionsByAddress.set(address, remaining);
        } else {
          connectionsByAddress.delete(address);
        }
      });
      socketServer.emit("connection", ws, req);
    });
  });
}

/**
 * Sends a message to a client, checking that it is one clients expect (see
 * schemas/liveUpdates.ts).
 * @param socket the client's connection
 * @param update the message
 */
function send(socket: WebSocket, update: LiveUpdate): void {
  socket.send(JSON.stringify(liveUpdateSchema.parse(update)));
}

/**
 * Closes the connections following a quest, whose clients reconnect and get a
 * ticket again if they're still allowed one.
 * @param questName the quest's name
 */
export function disconnectQuestFollowers(questName: string): void {
  webSocketSessions.forEach((session) => {
    if (session.questName === questName) {
      session.socket.close(SUBSCRIBE_AGAIN, "Subscribe again");
    }
  });
}

/**
 * Closes the connections following through a share link, once it's revoked.
 * @param shareLinkId the link's ID
 */
export function disconnectShareLinkFollowers(shareLinkId: string): void {
  webSocketSessions.forEach((session) => {
    if (session.shareLinkId === shareLinkId) {
      session.socket.close(SUBSCRIBE_AGAIN, "Subscribe again");
    }
  });
}

/**
 * Notifies the clients following a quest.
 * @param update the update to send, about the quest it names
 * @param excludeConnections the connections to leave out, such as the one an
 *  action came from
 */
export function notifyQuestFollowers(
  update: QuestUpdate,
  excludeConnections: string[] = []
): void {
  webSocketSessions.forEach((session) => {
    if (
      session.questName === update.questName &&
      !excludeConnections.includes(session.id)
    ) {
      send(session.socket, update);
    }
  });
}
