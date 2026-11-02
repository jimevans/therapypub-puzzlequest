import { randomUUID } from "crypto";
import { type WebSocket, WebSocketServer } from "ws";

/** A browser connected for live updates. */
interface WebSocketSession {
  /** The connection's ID, which the browser sends back with its requests. */
  id: string;
  socket: WebSocket;
  /** The path of the page the browser is showing, once it has sent "init". */
  url?: string;
}

/** A message a browser sends over the websocket. */
interface BrowserMessage {
  message?: string;
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
      const messageData: BrowserMessage = JSON.parse(data.toString());
      if (messageData.message === "init") {
        socket.send(JSON.stringify({ message: "connection", connectionId }));
        const url = new URL(messageData.url);
        webSocketSessions.get(connectionId).url = url.pathname;
      }
    });
    socket.on("close", () => {
      webSocketSessions.delete(connectionId);
    });
  });
  return socketServer;
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
  notificationData: object
): void {
  const notifyBrowsers: WebSocketSession[] = [];
  webSocketSessions.forEach((value) => {
    if (urls.includes(value.url) && !excludeConnections.includes(value.id)) {
      notifyBrowsers.push(value);
    }
  });
  notifyBrowsers.forEach((connection) =>
    connection.socket.send(JSON.stringify(notificationData))
  );
}
