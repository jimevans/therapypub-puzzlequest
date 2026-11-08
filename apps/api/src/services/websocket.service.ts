import { randomUUID } from "crypto";
import { type WebSocket, WebSocketServer } from "ws";
import { log } from "../logger.js";
import {
  type LiveUpdate,
  type QuestUpdate,
  liveUpdateSchema,
  liveUpdateSubscriptionSchema,
} from "../schemas/liveUpdates.js";

/** A client connected for live updates. */
interface WebSocketSession {
  /** The connection's ID, which the client sends back with its requests. */
  id: string;
  socket: WebSocket;
  /** The quest the client follows, once it has sent "subscribe". */
  questName?: string;
}

const webSocketSessions = new Map<string, WebSocketSession>();

/**
 * Initializes the websocket server to be used in the application.
 * @returns the instance of the websocket server created
 */
export function initialize(): WebSocketServer {
  const socketServer = new WebSocketServer({
    noServer: true,
    path: "/api/v1/updates",
  });
  socketServer.on("connection", (socket) => {
    const connectionId = randomUUID().replaceAll("-", "");
    webSocketSessions.set(connectionId, { id: connectionId, socket });
    socket.on("error", (err) => {
      log().warn({ err }, "live-update connection error");
    });
    socket.on("message", (data) => {
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
      send(socket, { message: "connection", connectionId });
      const session = webSocketSessions.get(connectionId);
      if (session) {
        session.questName = clientMessage.data.questName;
      }
    });
    socket.on("close", () => {
      webSocketSessions.delete(connectionId);
    });
  });
  return socketServer;
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
