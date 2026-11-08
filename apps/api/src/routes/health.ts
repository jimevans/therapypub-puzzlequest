import express from "express";
import mongoose from "mongoose";

/**
 * The health check, for the host or a monitor: 200 while the server can
 * reach its database, 503 when it can't. It says nothing more, since anyone
 * may ask.
 */
export const HealthRouter = express.Router();

HealthRouter.get("/healthz", (_req, res) => {
  const healthy =
    mongoose.connection.readyState === mongoose.ConnectionStates.connected;
  res
    .status(healthy ? 200 : 503)
    .set("Cache-Control", "no-store")
    .json({ status: healthy ? "ok" : "unavailable" });
});
