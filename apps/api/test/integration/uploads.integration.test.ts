// Multipart upload endpoints, exercised over HTTP through createApp() so that
// the real multer configuration in the routes is used.
import { existsSync } from "fs";
import { readdir, readFile, rm } from "fs/promises";
import path from "path";
import type { Express } from "express";
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
import { startSessions } from "../sessions.js";

const { createApp } = await import("../../src/createApp.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel, QuestPuzzleStatus } =
  await import("../../src/models/quest.model.js");
const { AuthorizationLevel, UserModel } =
  await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const { MAXIMUM_ACTIVATION_IMAGE_BYTES, MAXIMUM_PUZZLE_MEDIA_BYTES } =
  await import("../../src/middleware/upload.js");
const { activationRateLimiter } =
  await import("../../src/middleware/rateLimiter.js");

const puzzleDataDirectory = path.join(
  import.meta.dirname,
  "../../../../storage/puzzleData"
);
const uploadedFile = path.join(puzzleDataDirectory, "upload-test.png");

let mongoServer: MongoMemoryServer | undefined;
let app: Express;

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

/** The session token of the user the next requests come from. */
let signedInToken = "";

/**
 * Makes the next requests come from the given user, who must exist.
 * @param userName the user name
 */
async function signInAs(userName: string): Promise<void> {
  signedInToken = (await startSessions(userName))[userName];
}

/** An image in the RGBA pixel format of a canvas. */
interface PixelImage {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Renders text as a QR code in the RGBA pixel format that the activation
 * page sends from its camera canvas.
 * @param text the text to encode
 * @returns the image
 */
function renderQrCodePixels(text: string): PixelImage {
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

describe("POST /api/v1/quests/{name}/puzzles/{puzzleName}/activation", () => {
  let activationCode: string;

  beforeEach(async () => {
    await PuzzleModel.create({
      name: "colors",
      displayName: "Colors",
      solutionKeyword: "red",
      solutionDisplayText: "Red",
    });
    await QuestService.createQuest({
      name: "test-quest",
      assignee: { kind: "user", name: "player" },
      puzzles: [{ puzzleName: "colors" }],
    });
    await QuestService.startQuest("test-quest");
    const quest = await QuestModel.findOne({ name: "test-quest" }).lean();
    activationCode = quest!.puzzles[0].activationCode;
    await signInAs("player");
    // Failed attempts in earlier tests count towards the limit.
    await activationRateLimiter.resetKey("player");
    await activationRateLimiter.resetKey("admin");
  });

  function sendCode(code: string): request.Test {
    return request(app)
      .post("/api/v1/quests/test-quest/puzzles/colors/activation")
      .set("Authorization", `Bearer ${signedInToken}`)
      .send({ activationCode: code });
  }

  it("limits failed attempts by each user", async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect((await sendCode("wrong")).status).toBe(422);
    }

    // Even the right code is refused once the limit is reached.
    const limited = await sendCode(activationCode);
    expect(limited.status).toBe(429);
    expect(JSON.parse(limited.text).type).toBe("/problems/too-many-requests");

    // Other users, who may share the player's network, are not affected.
    await signInAs("admin");
    expect((await sendCode("wrong")).status).not.toBe(429);
  });

  it("does not count successful activations towards the limit", async () => {
    for (let attempt = 0; attempt < 19; attempt++) {
      await sendCode("wrong");
    }

    expect((await sendCode(activationCode)).status).toBe(200);
    expect((await sendCode("wrong")).status).not.toBe(429);
  });

  function sendImage(image: PixelImage): request.Test {
    // Same field order as activate.js: dimensions first, then the pixels.
    return request(app)
      .post("/api/v1/quests/test-quest/puzzles/colors/activation")
      .set("Authorization", `Bearer ${signedInToken}`)
      .field("height", String(image.height))
      .field("width", String(image.width))
      .attach("image", image.data, "blob");
  }

  it("activates the puzzle from a scanned QR code image", async () => {
    const response = await sendImage(renderQrCodePixels(activationCode));

    expect(response.status).toBe(200);
    expect(JSON.parse(response.text)).toEqual({
      activationTime: expect.any(String),
    });
    const quest = await QuestModel.findOne({ name: "test-quest" }).lean();
    expect(quest!.puzzles[0].status).toBe(QuestPuzzleStatus.IN_PROGRESS);
  });

  it("rejects a QR code for a different activation code", async () => {
    const response = await sendImage(renderQrCodePixels("not-the-code"));

    expect(response.status).toBe(422);
    expect(JSON.parse(response.text).type).toBe(
      "/problems/wrong-activation-code"
    );
  });

  it("reports an image with no QR code it can read", async () => {
    const blank = {
      data: Buffer.alloc(40 * 40 * 4, 255),
      width: 40,
      height: 40,
    };

    const response = await sendImage(blank);

    expect(response.status).toBe(422);
    expect(JSON.parse(response.text)).toMatchObject({
      type: "/problems/unreadable-qr-code",
      detail: "No QR code could be read from the image",
    });
  });

  it("can't be fooled by an image whose size doesn't match its pixels", async () => {
    const image = renderQrCodePixels(activationCode);

    const response = await sendImage({ ...image, width: image.width * 2 });

    expect(response.status).toBe(422);
    expect(JSON.parse(response.text).type).toBe("/problems/unreadable-qr-code");
  });

  it("still accepts an activation code typed as text", async () => {
    const response = await request(app)
      .post("/api/v1/quests/test-quest/puzzles/colors/activation")
      .set("Authorization", `Bearer ${signedInToken}`)
      .send({ activationCode });

    expect(response.status).toBe(200);
  });

  it("rejects an anonymous request before reading the image", async () => {
    const response = await request(app)
      .post("/api/v1/quests/test-quest/puzzles/colors/activation")
      .field("height", "1")
      .field("width", "1")
      .attach("image", Buffer.alloc(4), "blob");

    expect(response.status).toBe(401);
  });

  it("rejects an image larger than the limit", async () => {
    const response = await sendImage({
      data: Buffer.alloc(MAXIMUM_ACTIVATION_IMAGE_BYTES + 1),
      width: 1,
      height: 1,
    });

    expect(response.status).toBe(413);
    const quest = await QuestModel.findOne({ name: "test-quest" }).lean();
    expect(quest!.puzzles[0].status).toBe(
      QuestPuzzleStatus.AWAITING_ACTIVATION
    );
  });
});

describe("POST /api/v1/puzzle-media", () => {
  let filesBefore: string[];

  beforeEach(async () => {
    filesBefore = await readdir(puzzleDataDirectory);
  });

  function upload({
    puzzleName = "upload-test",
    fileExtension = "png",
    contents = Buffer.from("fake image bytes"),
  } = {}) {
    // Same field order as puzzleEdit.js: the fields that name the file
    // must arrive before the file itself.
    return request(app)
      .post("/api/v1/puzzle-media")
      .set("Authorization", `Bearer ${signedInToken}`)
      .field("puzzleName", puzzleName)
      .field("fileExtension", fileExtension)
      .attach("binary", contents, `puzzle.${fileExtension}`);
  }

  async function expectNothingWritten() {
    expect(await readdir(puzzleDataDirectory)).toEqual(filesBefore);
  }

  it("saves the file under puzzleData, named for the puzzle", async () => {
    await signInAs("admin");

    const response = await upload();

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe("/puzzleData/upload-test.png");
    expect(JSON.parse(response.text)).toEqual({
      path: "/puzzleData/upload-test.png",
    });
    expect(await readFile(uploadedFile, "utf8")).toBe("fake image bytes");
  });

  it("serves the saved file at the path it answers with", async () => {
    await signInAs("admin");

    const { headers } = await upload();
    const response = await request(app).get(headers.location as string);

    expect(response.status).toBe(200);
    expect(response.body.toString()).toBe("fake image bytes");
  });

  it("stores the extension in lowercase", async () => {
    await signInAs("admin");

    const response = await upload({ fileExtension: "PNG" });

    expect(JSON.parse(response.text).path).toBe("/puzzleData/upload-test.png");
    expect(existsSync(uploadedFile)).toBe(true);
  });

  it("rejects an anonymous upload without writing anything", async () => {
    const response = await request(app)
      .post("/api/v1/puzzle-media")
      .field("puzzleName", "upload-test")
      .field("fileExtension", "png")
      .attach("binary", Buffer.from("fake image bytes"), "puzzle.png");

    expect(response.status).toBe(401);
    await expectNothingWritten();
  });

  it("rejects an upload from a user who is not an admin without writing anything", async () => {
    await signInAs("player");

    const response = await upload();

    expect(response.status).toBe(403);
    await expectNothingWritten();
  });

  it.each([
    "../outside-test",
    "../../outside-test",
    "nested/outside-test",
    "nested\\outside-test",
    "..",
    ".",
    ".hidden-test",
    "",
    "line\nbreak",
  ])(
    "rejects the puzzle name %j without writing anything",
    async (puzzleName) => {
      await signInAs("admin");
      const target = path.resolve(puzzleDataDirectory, `${puzzleName}.png`);

      const response = await upload({ puzzleName });

      expect(response.status).toBe(400);
      expect(JSON.parse(response.text)).toEqual({
        type: "/problems/invalid-upload",
        title: "Upload not accepted",
        status: 400,
        detail: "Invalid puzzle name for an upload",
      });
      expect(existsSync(target) && target !== puzzleDataDirectory).toBe(false);
      await expectNothingWritten();
    }
  );

  it.each(["html", "js", "svg", "exe", "png/../x", ""])(
    "rejects the file extension %j without writing anything",
    async (fileExtension) => {
      await signInAs("admin");

      const response = await upload({ fileExtension });

      expect(response.status).toBe(400);
      expect(JSON.parse(response.text).detail).toMatch(/cannot be uploaded/);
      await expectNothingWritten();
    }
  );

  it("rejects a file sent before the fields that name it", async () => {
    await signInAs("admin");

    const response = await request(app)
      .post("/api/v1/puzzle-media")
      .set("Authorization", `Bearer ${signedInToken}`)
      .attach("binary", Buffer.from("fake image bytes"), "puzzle.png")
      .field("puzzleName", "upload-test")
      .field("fileExtension", "png");

    expect(response.status).toBe(400);
    await expectNothingWritten();
  });

  it("rejects an upload without a file", async () => {
    await signInAs("admin");

    const response = await request(app)
      .post("/api/v1/puzzle-media")
      .set("Authorization", `Bearer ${signedInToken}`)
      .field("puzzleName", "upload-test")
      .field("fileExtension", "png");

    expect(response.status).toBe(400);
    expect(JSON.parse(response.text)).toMatchObject({
      type: "/problems/invalid-upload",
      detail: "The request must include the file, in the binary field",
    });
  });

  it("rejects a file larger than the limit", async () => {
    await signInAs("admin");

    const response = await upload({
      contents: Buffer.alloc(MAXIMUM_PUZZLE_MEDIA_BYTES + 1),
    });

    expect(response.status).toBe(413);
    expect(JSON.parse(response.text)).toMatchObject({
      type: "/problems/upload-too-large",
      detail: "The uploaded file is too large",
    });
    expect(existsSync(uploadedFile)).toBe(false);
    // Sending 100 MB can take longer than the default 5 seconds on a busy
    // machine, such as a CI runner measuring coverage.
  }, 30000);
});
