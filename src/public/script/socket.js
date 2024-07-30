const WebSocketStateEnum = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };

let webSocketChannel;
const msgQueue = [];
let connectionId;

self.addEventListener("message", (e) => {
  if (e.data.message === "init") {
    sendMessage(_ => {
      webSocketChannel.send(JSON.stringify(e.data));
    });
  }
});

function sendMessage(task) {
  if (!webSocketChannel || webSocketChannel.readyState != WebSocketStateEnum.OPEN) {
    msgQueue.push(task);
  } else {
    task();
  }

  if (!webSocketChannel) {
    webSocketChannel = new WebSocket('ws://localhost:3000/api/updates');

    webSocketChannel.addEventListener("open", () => {
      while (msgQueue.length > 0) {
        msgQueue.shift()();
      }
    });

    webSocketChannel.addEventListener("message", (evt) => {
      self.postMessage(evt.data);
    });

    webSocketChannel.addEventListener("close", (evt) => {
      webSocketChannel = null;
    });

    webSocketChannel.addEventListener("error", (evt) => {
      if (webSocketChannel.readyState == WebSocketStateEnum.OPEN) {
        webSocketChannel.close();
      } else {
        webSocketChannel = null;
      }
    });
  }
}
