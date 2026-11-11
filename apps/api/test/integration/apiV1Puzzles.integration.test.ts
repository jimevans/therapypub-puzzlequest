// Tests of the v1 API's puzzles, through the whole application. Uploading
// media is tested in uploads.integration.test.ts, and who may use each route
// in the authorization matrix.
import type { Express } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { startSessions } from "../sessions.js";

const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;
let admin = "";

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  // The tests of unique names need the indexes built.
  await PuzzleModel.init();
  app = createApp();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    PuzzleModel.deleteMany({}),
    QuestModel.deleteMany({}),
  ]);
  await UserModel.create({
    userName: "admin",
    displayName: "Admin",
    email: "admin@example.com",
    password: "hash",
    authorizationLevel: AuthorizationLevel.ADMIN,
  });
  await PuzzleModel.create({
    name: "riddle",
    displayName: "Riddle",
    type: 1,
    text: "/puzzleData/riddle.png",
    solutionKeyword: "piano",
    solutionDisplayText: "A piano",
    hints: [{ text: "It makes music", timePenalty: 60 }],
  });
  ({ admin } = await startSessions("admin"));
});

function asAdmin(method: "get" | "post" | "patch" | "delete", path: string) {
  return request(app)
    [method](`/api/v1${path}`)
    .set("Authorization", `Bearer ${admin}`);
}

function bodyOf(response: request.Response) {
  return JSON.parse(response.text);
}

describe("a puzzle", () => {
  it("is shown with its solution and hints", async () => {
    const response = await asAdmin("get", "/puzzles/riddle");

    expect(bodyOf(response)).toEqual({
      puzzleName: "riddle",
      displayName: "Riddle",
      type: "image",
      text: "/puzzleData/riddle.png",
      solutionKeyword: "piano",
      solutionText: "A piano",
      hints: [
        {
          text: "It makes music",
          solutionWarning: false,
          timePenaltySeconds: 60,
        },
      ],
    });
  });

  it("is created, with defaults for what is left out", async () => {
    const response = await asAdmin("post", "/puzzles").send({
      puzzleName: "enigma",
      solutionKeyword: "x",
      solutionText: "X",
    });

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe("/api/v1/puzzles/enigma");
    expect(bodyOf(response)).toMatchObject({
      puzzleName: "enigma",
      displayName: "enigma",
      type: "text",
      text: "",
      solutionText: "X",
      hints: [],
    });
  });

  it("is created with its type, solution text, and hints, stored as before", async () => {
    const response = await asAdmin("post", "/puzzles").send({
      puzzleName: "tune",
      type: "audio",
      text: "/puzzleData/tune.mp3",
      solutionKeyword: "waltz",
      solutionText: "A waltz",
      hints: [{ text: "Count to three", timePenaltySeconds: 90 }],
    });

    expect(response.status).toBe(201);
    expect(bodyOf(response)).toMatchObject({
      type: "audio",
      solutionText: "A waltz",
      hints: [
        {
          text: "Count to three",
          solutionWarning: false,
          timePenaltySeconds: 90,
        },
      ],
    });
    const stored = (await PuzzleModel.findOne({ name: "tune" }).lean())!;
    expect(stored).toMatchObject({
      type: 2,
      solutionDisplayText: "A waltz",
      hints: [
        { text: "Count to three", solutionWarning: false, timePenalty: 90 },
      ],
    });
  });

  it("changes its type and solution text, stored as before", async () => {
    const response = await asAdmin("patch", "/puzzles/riddle").send({
      type: "video",
      solutionText: "A grand piano",
    });

    expect(response.status).toBe(200);
    expect(bodyOf(response)).toMatchObject({
      type: "video",
      solutionText: "A grand piano",
    });
    const stored = (await PuzzleModel.findOne({ name: "riddle" }).lean())!;
    expect(stored).toMatchObject({
      type: 3,
      solutionDisplayText: "A grand piano",
      text: "/puzzleData/riddle.png",
    });
  });

  it("refuses a type it doesn't know", async () => {
    const response = await asAdmin("patch", "/puzzles/riddle").send({
      type: 1,
    });

    expect(response.status).toBe(400);
    expect(bodyOf(response).errors).toEqual([
      { path: "body.type", message: "Must be a known puzzle type" },
    ]);
  });

  it("can't share another's name", async () => {
    const response = await asAdmin("post", "/puzzles").send({
      puzzleName: "riddle",
      solutionKeyword: "x",
      solutionText: "X",
    });

    expect(response.status).toBe(409);
    expect(bodyOf(response).type).toBe("/problems/already-exists");
  });

  it("keeps its media file when a change leaves out the text", async () => {
    const response = await asAdmin("patch", "/puzzles/riddle").send({
      solutionKeyword: "grand piano",
    });

    expect(response.status).toBe(200);
    expect(bodyOf(response)).toMatchObject({
      text: "/puzzleData/riddle.png",
      solutionKeyword: "grand piano",
    });
  });

  it("is a problem to change when there is none", async () => {
    const response = await asAdmin("patch", "/puzzles/nothing").send({
      displayName: "Nothing",
    });

    expect(response.status).toBe(404);
    expect(bodyOf(response).type).toBe("/problems/not-found");
  });

  it("can't be deleted while a quest uses it", async () => {
    await UserModel.create({
      userName: "player",
      displayName: "Player",
      email: "player@example.com",
      password: "hash",
    });
    await QuestService.createQuest({
      name: "quest",
      entrants: [{ kind: "user", name: "player" }],
      puzzles: [{ puzzleName: "riddle" }],
    });

    const response = await asAdmin("delete", "/puzzles/riddle");

    expect(response.status).toBe(409);
    expect(bodyOf(response)).toMatchObject({
      type: "/problems/in-use",
      detail:
        "Puzzle riddle is used by quest quest; remove it from that quest first",
    });
  });

  it("is deleted when no quest uses it", async () => {
    expect((await asAdmin("delete", "/puzzles/riddle")).status).toBe(204);
    expect((await asAdmin("get", "/puzzles/riddle")).status).toBe(404);
  });
});

describe("listing puzzles", () => {
  it("comes a page at a time", async () => {
    await PuzzleModel.create({
      name: "enigma",
      solutionKeyword: "x",
      solutionDisplayText: "X",
    });

    const first = bodyOf(await asAdmin("get", "/puzzles?limit=1"));
    const second = bodyOf(
      await asAdmin("get", `/puzzles?limit=1&after=${first.next}`)
    );

    expect(
      first.items.map((p: { puzzleName: string }) => p.puzzleName)
    ).toEqual(["riddle"]);
    expect(second).toEqual({
      items: [expect.objectContaining({ puzzleName: "enigma" })],
      next: null,
    });
  });
});

describe("the upload's description", () => {
  it("is a multipart form with the file last", async () => {
    const document = bodyOf(await request(app).get("/api/v1/openapi.json"));

    const upload =
      document.paths["/puzzle-media"].post.requestBody.content[
        "multipart/form-data"
      ].schema;
    expect(Object.keys(upload.properties)).toEqual([
      "puzzleName",
      "fileExtension",
      "binary",
    ]);
    expect(upload.properties.binary).toMatchObject({ type: "string" });
  });
});
