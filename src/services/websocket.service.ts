import { randomUUID } from "crypto";
import { type WebSocket, WebSocketServer } from "ws";
import {
  type LiveUpdate,
  liveUpdateSchema,
  pageMessageSchema,
} from "../schemas/liveUpdates.js";

/** A browser connected for live updates. */
interface WebSocketSession {
  /** The connection's ID, which the browser sends back with its requests. */
  id: string;
  socket: WebSocket;
  /** The path of the page the browser is showing, once it has sent "init". */
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
    path: "/api/updates",
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
      const pageMessage = pageMessageSchema.safeParse(received);
      if (!pageMessage.success) {
        return;
      }
      send(socket, { message: "connection", connectionId });
      const session = webSocketSessions.get(connectionId);
      if (session) {
        session.url = new URL(pageMessage.data.url).pathname;
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
 * Notifies the currently connected browsers, as specified by the URL they are
 * connected from.
 * @param urls the URLs for which to notify browsers
 * @param excludeConnections the connections to leave out of this notification
 * @param notificationData the data to send to the connected browsers
 */
export function notifyBrowsers(
  urls: string[],
  excludeConnections: string[],
  notificationData: LiveUpdate
): void {
  const notifyBrowsers: WebSocketSession[] = [];
  webSocketSessions.forEach((value) => {
    if (
      value.url !== undefined &&
      urls.includes(value.url) &&
      !excludeConnections.includes(value.id)
    ) {
      notifyBrowsers.push(value);
    }
  });
  notifyBrowsers.forEach((connection) =>
    send(connection.socket, notificationData)
  );
}

/**
 * Notifies every browser showing a page of a quest: the quest page, its
 * puzzle pages, and their monitor views.
 * @param questName the name of the quest
 * @param notificationData the data to send to the connected browsers
 */
export function notifyQuestPages(
  questName: string,
  notificationData: LiveUpdate
): void {
  const prefixes = [`/quest/${questName}`, `/monitor/quest/${questName}`];
  webSocketSessions.forEach((session) => {
    const url = session.url;
    if (
      url !== undefined &&
      prefixes.some((prefix) => url === prefix || url.startsWith(`${prefix}/`))
    ) {
      send(session.socket, notificationData);
    }
  });
}
