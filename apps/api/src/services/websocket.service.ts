import { randomUUID } from "crypto";
import { type WebSocket, WebSocketServer } from "ws";
import {
  type LiveUpdate,
  type QuestUpdate,
  clientMessageSchema,
  liveUpdateSchema,
} from "../schemas/liveUpdates.js";

/** A client connected for live updates. */
interface WebSocketSession {
  /** The connection's ID, which the client sends back with its requests. */
  id: string;
  socket: WebSocket;
  /** The quest the client follows, once it has sent "subscribe". */
  questName?: string;
  /** The path of the page a browser is showing, once it has sent "init". */
  url?: string;
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
    socket.on("error", console.error);
    socket.on("message", (data) => {
      // Anyone can connect, so ignore anything that isn't a valid message; an
      // exception here would stop the whole server.
      let received: unknown;
      try {
        received = JSON.parse(data.toString());
      } catch {
        return;
      }
      const clientMessage = clientMessageSchema.safeParse(received);
      if (!clientMessage.success) {
        return;
      }
      send(socket, { message: "connection", connectionId });
      const session = webSocketSessions.get(connectionId);
      if (session) {
        if (clientMessage.data.message === "subscribe") {
          session.questName = clientMessage.data.questName;
        } else {
          session.url = new URL(clientMessage.data.url).pathname;
        }
      }
    });
    socket.on("close", () => {
      webSocketSessions.delete(connectionId);
    });
  });
  return socketServer;
}

/**
 * Sends a message to a page, checking that it is one the pages expect (see
 * schemas/liveUpdates.ts).
 * @param socket the page's connection
 * @param update the message
 */
function send(socket: WebSocket, update: LiveUpdate): void {
  socket.send(JSON.stringify(liveUpdateSchema.parse(update)));
}

/**
 * Notifies the clients following a quest, and the browsers showing any of the
 * given pages.
 * @param urls the paths of the pages for which to notify browsers
 * @param excludeConnections the connections to leave out of this notification
 * @param update the update to send, about the quest it names
 */
export function notifyBrowsers(
  urls: string[],
  excludeConnections: string[],
  update: QuestUpdate
): void {
  const recipients: WebSocketSession[] = [];
  webSocketSessions.forEach((session) => {
    if (
      (session.questName === update.questName ||
        (session.url !== undefined && urls.includes(session.url))) &&
      !excludeConnections.includes(session.id)
    ) {
      recipients.push(session);
    }
  });
  recipients.forEach(({ socket }) => send(socket, update));
}

/**
 * Notifies every client of a quest: those following it, and the browsers
 * showing the quest page, its puzzle pages, or their monitor views.
 * @param update the update to send, about the quest it names
 */
export function notifyQuestPages(update: QuestUpdate): void {
  const prefixes = [
    `/quest/${update.questName}`,
    `/monitor/quest/${update.questName}`,
  ];
  webSocketSessions.forEach((session) => {
    const url = session.url;
    if (
      session.questName === update.questName ||
      (url !== undefined &&
        prefixes.some(
          (prefix) => url === prefix || url.startsWith(`${prefix}/`)
        ))
    ) {
      send(session.socket, update);
    }
  });
}
