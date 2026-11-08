// Backups of what Git doesn't have: the database, and uploaded puzzle media.
// A backup is a folder holding each collection as compressed Extended JSON
// (one document a line, keeping IDs and dates exact), a copy of the media,
// and a manifest of what it holds, with checksums, so that a backup or a
// restore can be checked as complete. See cli.ts for the commands, and the
// README for turning nightly backups on.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import mongoose from "mongoose";
import { EmailVerificationModel } from "../models/emailVerification.model.js";
import { OrganizationModel } from "../models/organization.model.js";
import { PasswordResetModel } from "../models/passwordReset.model.js";
import { PuzzleModel } from "../models/puzzle.model.js";
import { QuestEventModel } from "../models/questEvent.model.js";
import { QuestModel } from "../models/quest.model.js";
import { SessionModel } from "../models/session.model.js";
import { TeamModel, UserModel } from "../models/user.model.js";

const { EJSON } = mongoose.mongo.BSON;
type Db = mongoose.mongo.Db;

/** The version of the backup's layout, for restoring older backups. */
const FORMAT = 1;
const MANIFEST = "manifest.json";
const DATABASE_FOLDER = "db";
const MEDIA_FOLDER = "media";

/**
 * Collections left out: signing in again is better than restoring sessions,
 * or links that should have expired.
 */
const LEFT_OUT = new Set(
  [SessionModel, PasswordResetModel, EmailVerificationModel].map(
    (model) => model.collection.collectionName
  )
);

/** Models whose indexes a restore rebuilds. */
const MODELS = [
  OrganizationModel,
  UserModel,
  TeamModel,
  PuzzleModel,
  QuestModel,
  QuestEventModel,
  SessionModel,
  PasswordResetModel,
  EmailVerificationModel,
];

/** What a backup holds. */
export interface Manifest {
  format: number;
  /** When it was made, as an ISO date. */
  createdAt: string;
  /** The Git commit the app was running, so the data's shape is known. */
  commit: string;
  /** The database it was made from. */
  database: string;
  /** Each collection: how many documents, in which file, with its checksum. */
  collections: Record<
    string,
    { documents: number; file: string; sha256: string }
  >;
  /** Each media file, by its path in the media folder. */
  media: Record<string, { bytes: number; sha256: string }>;
}

/** A backup folder's name: when it was made, such as 2026-11-08T03-00-00Z. */
export const BACKUP_NAME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/;

/**
 * Names a backup made at a time.
 * @param when the time
 * @returns the name
 */
export function backupNameAt(when: Date): string {
  return when
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "-");
}

/**
 * Computes a file's SHA-256 checksum.
 * @param file the file
 * @returns the checksum, in hexadecimal
 */
async function checksumOf(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

/**
 * Lists the files under a folder, by their paths relative to it. Links are
 * left out, so a backup never follows one out of the folder.
 * @param folder the folder
 * @returns the relative paths, sorted; none if the folder doesn't exist
 */
async function filesUnder(folder: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(folder, { recursive: true, withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(folder, path.join(entry.parentPath, entry.name))
    )
    .sort();
}

/**
 * Lists the collections in a database that a backup or restore deals with:
 * all but MongoDB's own.
 * @param db the database
 * @returns their names
 */
async function collectionsOf(db: Db): Promise<string[]> {
  const collections = await db
    .listCollections({}, { nameOnly: true })
    .toArray();
  return collections
    .map((collection) => collection.name)
    .filter((name) => !name.startsWith("system."))
    .sort();
}

/** What a backup needs. */
export interface BackupOptions {
  db: Db;
  /** Where uploaded media is. */
  mediaDirectory: string;
  /** The folder backups go in, each in a folder of its own. */
  backupsDirectory: string;
  /** The Git commit the app is running. */
  commit: string;
  /** When it's made; now by default. */
  now?: Date;
}

/**
 * Makes a backup. It's written to a folder starting ".partial-" and renamed
 * once complete, so a backup that's there by its name is whole.
 * @param options what it needs
 * @returns the backup's folder
 */
export async function createBackup({
  db,
  mediaDirectory,
  backupsDirectory,
  commit,
  now = new Date(),
}: BackupOptions): Promise<string> {
  const name = backupNameAt(now);
  const partial = path.join(backupsDirectory, `.partial-${name}`);
  const finished = path.join(backupsDirectory, name);
  // Backups hold personal data: only this account may read them.
  await mkdir(backupsDirectory, { recursive: true, mode: 0o700 });
  await rm(partial, { recursive: true, force: true });
  await mkdir(path.join(partial, DATABASE_FOLDER), {
    recursive: true,
    mode: 0o700,
  });

  const manifest: Manifest = {
    format: FORMAT,
    createdAt: now.toISOString(),
    commit,
    database: db.databaseName,
    collections: {},
    media: {},
  };

  for (const collection of await collectionsOf(db)) {
    if (LEFT_OUT.has(collection)) {
      continue;
    }
    const file = path.join(DATABASE_FOLDER, `${collection}.jsonl.gz`);
    let documents = 0;
    async function* lines() {
      for await (const document of db.collection(collection).find()) {
        documents++;
        yield `${EJSON.stringify(document, { relaxed: false })}\n`;
      }
    }
    await pipeline(
      Readable.from(lines()),
      createGzip(),
      createWriteStream(path.join(partial, file), { mode: 0o600 })
    );
    manifest.collections[collection] = {
      documents,
      file,
      sha256: await checksumOf(path.join(partial, file)),
    };
  }

  for (const file of await filesUnder(mediaDirectory)) {
    const copy = path.join(partial, MEDIA_FOLDER, file);
    await mkdir(path.dirname(copy), { recursive: true, mode: 0o700 });
    await copyFile(path.join(mediaDirectory, file), copy);
    manifest.media[file] = {
      bytes: (await stat(copy)).size,
      sha256: await checksumOf(copy),
    };
  }

  await writeFile(
    path.join(partial, MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 }
  );
  await rename(partial, finished);
  return finished;
}

/**
 * Reads a backup's manifest.
 * @param backup the backup's folder
 * @returns the manifest
 */
export async function readManifest(backup: string): Promise<Manifest> {
  const manifest = JSON.parse(
    await readFile(path.join(backup, MANIFEST), "utf8")
  ) as Manifest;
  if (manifest.format !== FORMAT) {
    throw new Error(
      `The backup's format is ${manifest.format}; this version reads ${FORMAT}`
    );
  }
  return manifest;
}

/**
 * Reads a collection's documents from a backup, one at a time.
 * @param backup the backup's folder
 * @param file the collection's file, as the manifest names it
 * @yields each document
 */
async function* documentsIn(
  backup: string,
  file: string
): AsyncGenerator<mongoose.mongo.Document> {
  const lines = createInterface({
    input: createReadStream(path.join(backup, file)).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (line !== "") {
      yield EJSON.parse(line, { relaxed: false }) as mongoose.mongo.Document;
    }
  }
}

/**
 * Checks a backup is whole: every file is there, with the checksum and the
 * number of documents its manifest gives, and nothing else is in its media.
 * @param backup the backup's folder
 * @returns what's wrong, one line each; none if it's whole
 */
export async function verifyBackup(backup: string): Promise<string[]> {
  const problems: string[] = [];
  const manifest = await readManifest(backup);
  for (const [collection, { documents, file, sha256 }] of Object.entries(
    manifest.collections
  )) {
    try {
      if ((await checksumOf(path.join(backup, file))) !== sha256) {
        problems.push(`${file} isn't the file the backup made`);
        continue;
      }
      let count = 0;
      for await (const document of documentsIn(backup, file)) {
        if (document) {
          count++;
        }
      }
      if (count !== documents) {
        problems.push(
          `${collection} has ${count} documents, where the backup made ${documents}`
        );
      }
    } catch {
      problems.push(`${file} is missing or unreadable`);
    }
  }
  for (const file of Object.keys(manifest.media)) {
    const normal = path.normalize(file);
    if (path.isAbsolute(normal) || normal.split(path.sep).includes("..")) {
      problems.push(`The backup names a file outside its media: ${file}`);
    }
  }
  if (problems.length > 0) {
    return problems;
  }
  problems.push(
    ...(await mediaProblems(
      path.join(backup, MEDIA_FOLDER),
      manifest,
      "backup"
    ))
  );
  return problems;
}

/**
 * Checks a media folder holds exactly the files a manifest lists.
 * @param folder the folder
 * @param manifest the manifest
 * @param what which copy it is, for the messages
 * @returns what's wrong, one line each
 */
async function mediaProblems(
  folder: string,
  manifest: Manifest,
  what: string
): Promise<string[]> {
  const problems: string[] = [];
  const present = new Set(await filesUnder(folder));
  for (const [file, { sha256 }] of Object.entries(manifest.media)) {
    if (!present.has(file)) {
      problems.push(`The ${what}'s media is missing ${file}`);
    } else if ((await checksumOf(path.join(folder, file))) !== sha256) {
      problems.push(`The ${what}'s copy of ${file} isn't the one backed up`);
    }
    present.delete(file);
  }
  for (const file of present) {
    problems.push(`The ${what}'s media has ${file}, which wasn't backed up`);
  }
  return problems;
}

/**
 * Checks a database and media folder hold what a backup does.
 * @param backup the backup's folder
 * @param db the database
 * @param mediaDirectory the media folder
 * @returns what's different, one line each; none if they match
 */
export async function verifyRestored(
  backup: string,
  db: Db,
  mediaDirectory: string
): Promise<string[]> {
  const problems: string[] = [];
  const manifest = await readManifest(backup);
  for (const [collection, { documents }] of Object.entries(
    manifest.collections
  )) {
    const count = await db.collection(collection).countDocuments();
    if (count !== documents) {
      problems.push(
        `${collection} has ${count} documents, where the backup has ${documents}`
      );
    }
  }
  problems.push(
    ...(await mediaProblems(mediaDirectory, manifest, "restored site"))
  );
  return problems;
}

/** A restore that would have replaced data without being told to. */
export class RestoreRefusedError extends Error {}

/** What a restore needs. */
export interface RestoreOptions {
  /** The backup's folder. */
  backup: string;
  /** The database to restore into, through the app's models' connection. */
  connection: mongoose.Connection;
  /** Where media goes. */
  mediaDirectory: string;
  /**
   * The database's name, to confirm replacing what's in it. Without it, a
   * restore goes only into an empty database and media folder.
   */
  confirm?: string;
}

/**
 * Restores a backup: checks it's whole, replaces the database's collections
 * and the media with the backup's, rebuilds the indexes, and checks the
 * result. Sessions and links aren't in a backup, so everyone signs in again.
 * @param options what it needs
 * @returns the backup's manifest
 * @throws {RestoreRefusedError} if there's data to replace, unconfirmed
 */
export async function restoreBackup({
  backup,
  connection,
  mediaDirectory,
  confirm,
}: RestoreOptions): Promise<Manifest> {
  const db = connection.db!;
  const problems = await verifyBackup(backup);
  if (problems.length > 0) {
    throw new Error(`The backup isn't whole:\n${problems.join("\n")}`);
  }
  const manifest = await readManifest(backup);

  const existing = await collectionsOf(db);
  const hasData =
    (
      await Promise.all(
        existing.map((name) => db.collection(name).estimatedDocumentCount())
      )
    ).some((count) => count > 0) ||
    (await filesUnder(mediaDirectory)).length > 0;
  if (hasData && confirm !== db.databaseName) {
    throw new RestoreRefusedError(
      `Database ${db.databaseName} or the media folder already holds data. To replace it, confirm with the database's name: --confirm ${db.databaseName}`
    );
  }

  for (const name of existing) {
    await db.collection(name).drop();
  }
  for (const [collection, { file }] of Object.entries(manifest.collections)) {
    let batch: mongoose.mongo.Document[] = [];
    for await (const document of documentsIn(backup, file)) {
      batch.push(document);
      if (batch.length === 500) {
        await db.collection(collection).insertMany(batch);
        batch = [];
      }
    }
    if (batch.length > 0) {
      await db.collection(collection).insertMany(batch);
    }
  }

  await rm(mediaDirectory, { recursive: true, force: true });
  await mkdir(mediaDirectory, { recursive: true });
  for (const file of Object.keys(manifest.media)) {
    const target = path.resolve(mediaDirectory, file);
    // A backup names files inside the media folder, never outside it.
    if (!target.startsWith(path.resolve(mediaDirectory) + path.sep)) {
      throw new Error(
        `The backup names a file outside the media folder: ${file}`
      );
    }
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(backup, MEDIA_FOLDER, file), target);
  }

  for (const model of MODELS) {
    await (
      connection.models[model.modelName] ??
      connection.model(model.modelName, model.schema)
    ).syncIndexes();
  }

  const differences = await verifyRestored(backup, db, mediaDirectory);
  if (differences.length > 0) {
    throw new Error(
      `The restore doesn't match the backup:\n${differences.join("\n")}`
    );
  }
  return manifest;
}
