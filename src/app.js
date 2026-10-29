// Application startup: connects to MongoDB, then serves HTTP and websocket
// traffic. The hosting configuration runs this file (directly or through
// loader.cjs), so it must stay at src/app.js. The application itself is
// defined in createApp.js.
import * as http from "http";
import mongoose from "mongoose";
import { config } from "./config.js";
import { createApp } from "./createApp.js";
import * as WebSocketService from "./services/websocket.service.js";

mongoose.set("strictQuery", false);
mongoose.connection.on(
  "error",
  console.error.bind(console, "MongoDB connection error:")
);

try {
  await mongoose.connect(config.PQ_MONGODB_URI);
} catch (err) {
  console.error(`Unable to connect to MongoDB: ${err.message}`);
  process.exit(1);
}

const server = http.createServer(createApp());

const socketServer = WebSocketService.initialize();
server.on("upgrade", (req, socket, header) => {
  socketServer.handleUpgrade(req, socket, header, (ws) =>
    socketServer.emit("connection", ws, req)
  );
});

server.listen(config.PQ_PORT, () => {
  console.log(
    `Therapy Pub and Co. PuzzleQuest app listening on port ${config.PQ_PORT}!`
  );
});
