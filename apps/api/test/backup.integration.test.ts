// Backing up the database and media, and restoring them, against a database
// of its own.
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  RestoreRefusedError,
  createBackup,
  readManifest,
  restoreBackup,
  verifyBackup,
} = await import("../src/backup/backup.js");
const { run } = await import("../src/backup/cli.js");
const { config } = await import("../src/config.js");

const { EJSON, ObjectId } = mongoose.mongo.BSON;

let mongoServer: MongoMemoryServer;
let target: mongoose.Connection;
let folder: string;
let media: string;
let backups: string;

const PLAYER_ID = new ObjectId();
const STARTED = new Date("2026-11-07T10:00:00.123Z");

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri("puzzlequest"));
  target = mongoose.createConnection(mongoServer.getUri("restored"));
  await target.asPromise();
}, 120000);

afterAll(async () => {
  await target.close();
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "puzzlequest-backup-"));
  media = path.join(folder, "media");
  backups = path.join(folder, "backups");
  await mkdir(path.join(media, "audio"), { recursive: true });
  await writeFile(path.join(media, "riddle.png"), "a picture");
  await writeFile(path.join(media, "audio", "clue.mp3"), "a sound");

  const db = mongoose.connection.db!;
  await db.dropDatabase();
  await target.db!.dropDatabase();
  await db.collection("users").insertOne({
    _id: PLAYER_ID,
    userName: "player",
    password: "hashed",
    emailVerifiedAt: STARTED,
    authorizationLevel: 1,
  });
  await db.collection("quests").insertOne({
    name: "trail",
    assignee: { kind: "user", id: PLAYER_ID },
    puzzles: [{ puzzleId: new ObjectId(), startTime: STARTED, hints: 2 }],
    progress: { elapsedMs: 1.5 },
  });
  await db.collection("sessions").insertOne({ tokenHash: "secret" });
  await db.collection("passwordresets").insertOne({ tokenHash: "secret" });
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/**
 * Reads a collection exactly, as Extended JSON, in a fixed order.
 * @param db the database
 * @param name the collection
 * @returns its documents
 */
async function exactly(db: mongoose.mongo.Db, name: string) {
  const documents = await db.collection(name).find().sort({ _id: 1 }).toArray();
  return documents.map((document) =>
    EJSON.stringify(document, { relaxed: false })
  );
}

async function backUp() {
  return createBackup({
    db: mongoose.connection.db!,
    mediaDirectory: media,
    backupsDirectory: backups,
    commit: "abc123",
    now: new Date("2026-11-08T03:00:00.000Z"),
  });
}

describe("a backup", () => {
  it("holds the database and media, named by when it was made, for this account only", async () => {
    const backup = await backUp();

    expect(path.basename(backup)).toBe("2026-11-08T03-00-00Z");
    expect(await readdir(backups)).toEqual(["2026-11-08T03-00-00Z"]);
    expect((await stat(backups)).mode & 0o777).toBe(0o700);
    const manifest = await readManifest(backup);
    expect(manifest).toMatchObject({
      createdAt: "2026-11-08T03:00:00.000Z",
      commit: "abc123",
      database: "puzzlequest",
      collections: {
        users: { documents: 1, file: "db/users.jsonl.gz" },
        quests: { documents: 1, file: "db/quests.jsonl.gz" },
      },
      media: {
        "riddle.png": { bytes: 9 },
        [path.join("audio", "clue.mp3")]: { bytes: 7 },
      },
    });
    expect(await verifyBackup(backup)).toEqual([]);
  });

  it("leaves out sessions and emailed links", async () => {
    const manifest = await readManifest(await backUp());

    expect(Object.keys(manifest.collections).sort()).toEqual([
      "quests",
      "users",
    ]);
  });
});

describe("checking a backup", () => {
  it("finds a changed collection file", async () => {
    const backup = await backUp();
    await writeFile(path.join(backup, "db", "users.jsonl.gz"), "not it");

    expect(await verifyBackup(backup)).toEqual([
      "db/users.jsonl.gz isn't the file the backup made",
    ]);
  });

  it("finds media missing, changed, or added", async () => {
    const backup = await backUp();
    await rm(path.join(backup, "media", "riddle.png"));
    await writeFile(path.join(backup, "media", "audio", "clue.mp3"), "another");
    await writeFile(path.join(backup, "media", "stray.txt"), "?");

    expect(await verifyBackup(backup)).toEqual([
      `The backup's copy of ${path.join("audio", "clue.mp3")} isn't the one backed up`,
      "The backup's media is missing riddle.png",
      "The backup's media has stray.txt, which wasn't backed up",
    ]);
  });

  it("refuses media named outside its folder", async () => {
    const backup = await backUp();
    const manifest = JSON.parse(
      await readFile(path.join(backup, "manifest.json"), "utf8")
    );
    manifest.media["../../escape.sh"] = { bytes: 1, sha256: "x" };
    await writeFile(
      path.join(backup, "manifest.json"),
      JSON.stringify(manifest)
    );

    expect(await verifyBackup(backup)).toEqual([
      "The backup names a file outside its media: ../../escape.sh",
    ]);
  });
});

describe("restoring a backup", () => {
  it("gives back exactly what was backed up, with the indexes, and no sessions", async () => {
    const backup = await backUp();
    const restoredMedia = path.join(folder, "restored-media");

    await restoreBackup({
      backup,
      connection: target,
      mediaDirectory: restoredMedia,
    });

    const db = target.db!;
    for (const name of ["users", "quests"]) {
      expect(await exactly(db, name)).toEqual(
        await exactly(mongoose.connection.db!, name)
      );
    }
    expect(await db.collection("sessions").countDocuments()).toBe(0);
    const userIndexes = await db.collection("users").indexes();
    expect(userIndexes.map((index) => index.name)).toContain(
      "organizationId_1_userName_1"
    );
    expect(
      await readFile(path.join(restoredMedia, "audio", "clue.mp3"), "utf8")
    ).toBe("a sound");
  });

  it("won't replace data unless told the database's name", async () => {
    const backup = await backUp();
    await target.db!.collection("users").insertOne({ userName: "newer" });
    const restoredMedia = path.join(folder, "restored-media");

    await expect(
      restoreBackup({
        backup,
        connection: target,
        mediaDirectory: restoredMedia,
      })
    ).rejects.toThrow(RestoreRefusedError);
    await expect(
      restoreBackup({
        backup,
        connection: target,
        mediaDirectory: restoredMedia,
        confirm: "puzzlequest",
      })
    ).rejects.toThrow("--confirm restored");
    expect(await target.db!.collection("users").countDocuments()).toBe(1);

    await restoreBackup({
      backup,
      connection: target,
      mediaDirectory: restoredMedia,
      confirm: "restored",
    });

    const users = await target.db!.collection("users").find().toArray();
    expect(users.map((user) => user.userName)).toEqual(["player"]);
  });

  it("won't replace media files unless told to", async () => {
    const backup = await backUp();

    await expect(
      restoreBackup({ backup, connection: target, mediaDirectory: media })
    ).rejects.toThrow(RestoreRefusedError);
  });

  it("restores nothing from a backup that isn't whole", async () => {
    const backup = await backUp();
    await rm(path.join(backup, "media", "riddle.png"));

    await expect(
      restoreBackup({
        backup,
        connection: target,
        mediaDirectory: path.join(folder, "restored-media"),
      })
    ).rejects.toThrow("The backup isn't whole");
    expect(await target.db!.collection("users").countDocuments()).toBe(0);
  });
});

describe("the backup command", () => {
  it("makes a backup quietly, and removes ones no longer kept", async () => {
    const original = config.PQ_MONGODB_URI;
    config.PQ_MONGODB_URI = mongoServer.getUri("puzzlequest");
    await mkdir(path.join(backups, ".partial-2026-01-01T03-00-00Z"), {
      recursive: true,
    });
    for (let day = 1; day <= 20; day++) {
      await mkdir(
        path.join(backups, `2026-10-${String(day).padStart(2, "0")}T03-00-00Z`)
      );
    }

    try {
      expect(await run(["backup", "--to", backups, "--media", media])).toBe(0);
    } finally {
      config.PQ_MONGODB_URI = original;
      await mongoose.connect(mongoServer.getUri("puzzlequest"));
    }

    const left = await readdir(backups);
    expect(left).not.toContain(".partial-2026-01-01T03-00-00Z");
    expect(left.filter((name) => name.startsWith("2026-11-"))).toHaveLength(1);
    // The newest 14, and the newest of each earlier week.
    expect(left).toHaveLength(14 + 1);
  });

  it("says whether a backup is whole", async () => {
    const backup = await backUp();
    const out = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    expect(await run(["verify", backup])).toBe(0);
    expect(String(out.mock.calls[0]?.[0])).toMatch(
      /^Whole: \d+ collections and 2 media files, from 2026-11-08T03:00:00.000Z \(commit abc123\)/
    );
    await rm(path.join(backup, "media", "riddle.png"));
    expect(await run(["verify", backup])).toBe(1);
    expect(String(err.mock.calls[0]?.[0])).toContain("missing riddle.png");
    vi.restoreAllMocks();
  });

  it("restores a backup into the configured database", async () => {
    const backup = await backUp();
    const original = config.PQ_MONGODB_URI;
    config.PQ_MONGODB_URI = mongoServer.getUri("restored");
    // The command connects to its own database.
    await mongoose.disconnect();
    target = mongoose.createConnection(mongoServer.getUri("restored"));
    const out = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    try {
      expect(
        await run([
          "restore",
          backup,
          "--media",
          path.join(folder, "restored-media"),
        ])
      ).toBe(0);
    } finally {
      config.PQ_MONGODB_URI = original;
      vi.restoreAllMocks();
      await mongoose.connect(mongoServer.getUri("puzzlequest"));
    }

    expect(String(out.mock.calls[0]?.[0])).toContain(
      "Restored 2026-11-08T03:00:00.000Z's backup into restored"
    );
    expect(await target.db!.collection("users").countDocuments()).toBe(1);
  });

  it("explains itself when given something it doesn't do", async () => {
    expect(await run(["dance"])).toBe(2);
  });
});
