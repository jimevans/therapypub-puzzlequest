import path from "path";
import express from "express";
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.raw({ limit: "100mb", type: "application/octet-stream" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(import.meta.dirname, "public")));

import cookieParser from "cookie-parser";
app.use(cookieParser());

import { config } from "./config.js";
const mongodb = config.PQ_MONGODB_URI;

import mongoose from "mongoose";
mongoose.set("strictQuery", false);
mongoose.connect(mongodb);

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));

import { IndexRouter } from "./routes/index.js";
app.use("/", IndexRouter);

// API routes for data manipulation
import { UserApiRouter } from "./routes/api.user.js";
app.use("/api/user", UserApiRouter);

import { PuzzleApiRouter } from "./routes/api.puzzle.js";
app.use("/api/puzzle", PuzzleApiRouter);

import { QuestApiRouter } from "./routes/api.quest.js";
app.use("/api/quest", QuestApiRouter);

import { TeamApiRouter } from "./routes/api.team.js";
app.use("/api/team", TeamApiRouter);

//UI routes for data display
import { UserRouter } from "./routes/user.js";
app.use("/user", UserRouter);

import { PuzzleRouter } from "./routes/puzzle.js";
app.use("/puzzle", PuzzleRouter);

import { QuestRouter } from "./routes/quest.js";
app.use("/quest", QuestRouter);

app.set("views", path.join(import.meta.dirname, "views"));
app.set("view engine", "ejs");

app.listen(port, () => {
  console.log(`Therapy Pub and Co. PuzzleQuest app listening on port ${port}!`);
});
