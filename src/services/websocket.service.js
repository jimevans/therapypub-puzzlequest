import { randomUUID } from "crypto";
import { WebSocketServer } from "ws";

const webSocketSessions = new Map();

/**
 * Initializes the websocket server to be used in the application.
 * @returns {WebSocketServer} the instance of the websocket server created
 */
export function initialize() {
  const socketServer = new WebSocketServer({
    noServer: true,
    path: "/api/updates",
  });
  socketServer.on("connection", (socket, req) => {
    const connectionId = randomUUID().replaceAll("-", "");
    webSocketSessions.set(connectionId, { id: connectionId, socket });
    socket.on("error", console.error);
    socket.on("message", (data) => {
      const messageData = JSON.parse(data);
      if (messageData.message === "init") {
        socket.send(JSON.stringify({ message: "connection", connectionId }));
        const url = new URL(messageData.url);
        webSocketSessions.get(connectionId).url = url.pathname;
      }
    });
    socket.on("close", (ws) => {
      webSocketSessions.delete(connectionId);
    });
  });
  return socketServer;
}

/**
 * Notifies the currently connected browsers, as specified by the URL they are connected from.
 * @param {string[]} urls the URLs for which to notify browsers
 * @param {string[]} excludeConnections an array of connections to be excluded from this notification
 * @param {object} notificationData the data to send to the connected browsers
 */
export function notifyBrowsers(urls, excludeConnections, notificationData) {
  const notifyBrowsers = [];
  webSocketSessions.forEach((value, key) => {
    if (urls.includes(value.url) && !excludeConnections.includes(value.id)) {
      notifyBrowsers.push(value);
    }
  });
  notifyBrowsers.forEach((connection) =>
    connection.socket.send(JSON.stringify(notificationData))
  );
}

export { webSocketSessions };
