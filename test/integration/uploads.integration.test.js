// Multipart upload endpoints, exercised over HTTP through createApp() so that
// the real multer configuration in the routes is used.
import { existsSync } from "fs";
import { readFile, rm } from "fs/promises";
import path from "path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import QRCode from "qrcode";
import request from "supertest";

const jwt = (await import("jsonwebtoken")).default;
const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel, QuestPuzzleStatus } =
  await import("../../src/models/quest.model.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");

const puzzleDataDirectory = path.join(
  import.meta.dirname,
  "../../src/public/puzzleData"
);
const uploadedFile = path.join(puzzleDataDirectory, "upload-test.png");

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = createApp();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await UserModel.deleteMany({});
  await PuzzleModel.deleteMany({});
  await QuestModel.deleteMany({});
  await UserModel.create([
    {
      userName: "player",
      displayName: "Player",
      email: "player@example.com",
      password: "hash",
      authorizationLevel: AuthorizationLevel.USER,
    },
    {
      userName: "admin",
      displayName: "Admin",
      email: "admin@example.com",
      password: "hash",
      authorizationLevel: AuthorizationLevel.ADMIN,
    },
  ]);
});

afterEach(async () => {
  await rm(uploadedFile, { force: true });
});

/**
 * Makes the (globally mocked) token verification return the given user.
 * @param {string} userName the user name
 * @param {number} authorizationLevel the user's authorization level
 */
function signInAs(userName, authorizationLevel) {
  jwt.verify.mockReturnValue({
    userName,
    displayName: userName,
    authorizationLevel,
    iat: Math.floor(Date.now() / 1000),
  });
}

/**
 * Renders text as a QR code in the RGBA pixel format that the activation
 * page sends from its camera canvas.
 * @param {string} text the text to encode
 * @returns {{data: Buffer, width: number, height: number}} the image
 */
function renderQrCodePixels(text) {
  const { modules } = QRCode.create(text);
  const scale = 4;
  const margin = 4;
  const size = (modules.size + margin * 2) * scale;
  const data = Buffer.alloc(size * size * 4, 0xff);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const moduleX = Math.floor(x / scale) - margin;
      const moduleY = Math.floor(y / scale) - margin;
      const dark =
        moduleX >= 0 &&
        moduleY >= 0 &&
        moduleX < modules.size &&
        moduleY < modules.size &&
        modules.get(moduleY, moduleX);
      if (dark) {
        data.fill(0, (y * size + x) * 4, (y * size + x) * 4 + 3);
      }
    }
  }
  return { data, width: size, height: size };
}

describe("POST /api/quest/:name/puzzle/:puzzleName/activate", () => {
  let activationCode;

  beforeEach(async () => {
    await PuzzleModel.create({
      name: "colors",
      displayName: "Colors",
      solutionKeyword: "red",
      solutionDisplayText: "Red",
    });
    await QuestService.createQuest({
      name: "test-quest",
      userName: "player",
      puzzles: [{ puzzleName: "colors" }],
    });
    await QuestService.startQuest("test-quest");
    const quest = await QuestModel.findOne({ name: "test-quest" }).lean();
    activationCode = quest.puzzles[0].activationCode;
    signInAs("player", AuthorizationLevel.USER);
  });

  function sendImage(image) {
    // Same field order as activate.js: dimensions first, then the pixels.
    return request(app)
      .post("/api/quest/test-quest/puzzle/colors/activate")
      .set("Authorization", "Bearer token")
      .field("height", String(image.height))
      .field("width", String(image.width))
      .attach("image", image.data, "blob");
  }

  it("activates the puzzle from a scanned QR code image", async () => {
    const response = await sendImage(renderQrCodePixels(activationCode));

    expect(response.status).toBe(200);
    expect(JSON.parse(response.text).status).toBe("success");
    const quest = await QuestModel.findOne({ name: "test-quest" }).lean();
    expect(quest.puzzles[0].status).toBe(QuestPuzzleStatus.IN_PROGRESS);
  });

  it("rejects a QR code for a different activation code", async () => {
    const response = await sendImage(renderQrCodePixels("not-the-code"));

    expect(response.status).toBe(406);
  });

  it("still accepts an activation code typed as text", async () => {
    const response = await request(app)
      .post("/api/quest/test-quest/puzzle/colors/activate")
      .set("Authorization", "Bearer token")
      .send({ activationCode });

    expect(response.status).toBe(200);
  });
});

describe("POST /api/puzzle/upload", () => {
  function upload() {
    // Same field order as puzzleEdit.js: the fields that name the file
    // must arrive before the file itself.
    return request(app)
      .post("/api/puzzle/upload")
      .set("Authorization", "Bearer token")
      .field("puzzleName", "upload-test")
      .field("fileExtension", "png")
      .attach("binary", Buffer.from("fake image bytes"), "puzzle.png");
  }

  it("saves the file under puzzleData, named for the puzzle", async () => {
    signInAs("admin", AuthorizationLevel.ADMIN);

    const response = await upload();

    expect(response.status).toBe(200);
    expect(JSON.parse(response.text)).toEqual({
      status: "success",
      data: "/puzzleData/upload-test.png",
    });
    expect(await readFile(uploadedFile, "utf8")).toBe("fake image bytes");
  });

  it("rejects an upload from a user who is not an admin", async () => {
    signInAs("player", AuthorizationLevel.USER);

    const response = await upload();

    expect(response.status).toBe(403);
  });

  it("writes the file even when the upload is rejected (current behavior)", async () => {
    // The file is stored before the controller checks authorization; Phase 2
    // upload hardening moves that check ahead of storage.
    signInAs("player", AuthorizationLevel.USER);

    await upload();

    expect(existsSync(uploadedFile)).toBe(true);
  });
});
