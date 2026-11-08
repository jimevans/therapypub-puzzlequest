// Fills a development database with sample data, through the app's own
// services, so it has the shape real data has: people of every role, a team,
// puzzles of every kind with their media, and quests in every state.
//
//   npm run seed            # into an empty database
//   npm run seed -- --reset # emptying the database first
//
// It runs only with PQ_RUNTIME_ENVIRONMENT=development, as a local .env sets
// it, so it can't touch a real site's data.
import { rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import QRCode from "qrcode";
import { config } from "../src/config.js";
import { AuthorizationLevel, UserModel } from "../src/models/user.model.js";
import { PuzzleType } from "../src/models/puzzle.model.js";
import { ensureDefaultOrganization } from "../src/models/organization.model.js";
import { puzzleDataDirectory } from "../src/paths.js";
import { redirectLog } from "../src/logger.js";
import * as PuzzleService from "../src/services/puzzle.service.js";
import * as QuestService from "../src/services/quest.service.js";
import * as TeamService from "../src/services/team.service.js";
import * as UserService from "../src/services/user.service.js";
import { subscribeQuestEventHandlers } from "../src/events/subscribers.js";

/** Everyone's password, for signing in as any of them. */
export const PASSWORD = "puzzlequest sample";

const PEOPLE = [
  {
    userName: "admin",
    displayName: "Pat the Puzzle Master",
    level: AuthorizationLevel.ADMIN,
  },
  {
    userName: "helper",
    displayName: "Harper the Helper",
    level: AuthorizationLevel.STAFF,
  },
  { userName: "alex", displayName: "Alex", level: AuthorizationLevel.USER },
  { userName: "blake", displayName: "Blake", level: AuthorizationLevel.USER },
  { userName: "casey", displayName: "Casey", level: AuthorizationLevel.USER },
  { userName: "drew", displayName: "Drew", level: AuthorizationLevel.USER },
];

/** The media files the seed makes, by name in the media folder. */
const MEDIA = { picture: "seed-skyline.png", sound: "seed-chime.wav" };

/**
 * Makes a short chime, as a WAV file: half a second of a 660 Hz tone.
 * @returns the file's bytes
 */
function chime(): Buffer {
  const rate = 8000;
  const samples = rate / 2;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const fade = 1 - i / samples;
    data.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 660 * i) / rate) * 12000 * fade),
      i * 2
    );
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * Stops the seed with a message if a step failed.
 * @param result what a service returned
 * @param what the step, for the message
 */
function check(result: { status: string; message?: string }, what: string) {
  if (result.status !== "success") {
    throw new Error(`Seeding failed at ${what}: ${result.message}`);
  }
}

/**
 * Gets the IDs a player acts as: their own, and their teams'.
 * @param userName the player
 * @returns the IDs
 */
async function actingAs(userName: string): Promise<string[]> {
  const user = await UserModel.findOne({ userName }).lean();
  const teams = await mongoose.connection
    .db!.collection("teams")
    .find({ memberIds: user!._id }, { projection: { _id: 1 } })
    .toArray();
  return [user!._id.toString(), ...teams.map((team) => team._id.toString())];
}

/**
 * Fills the database.
 * @param reset whether to empty it first
 */
export async function seed(reset: boolean): Promise<void> {
  if (config.PQ_RUNTIME_ENVIRONMENT !== "development") {
    throw new Error(
      "Seeding runs only with PQ_RUNTIME_ENVIRONMENT=development, so it can't touch a real site's data."
    );
  }
  const db = mongoose.connection.db!;
  if (reset) {
    await db.dropDatabase();
    for (const file of Object.values(MEDIA)) {
      await rm(path.join(puzzleDataDirectory, file), { force: true });
    }
  } else if ((await UserModel.estimatedDocumentCount()) > 0) {
    throw new Error(
      `Database ${db.databaseName} already has data. To replace it with the sample data, run: npm run seed -- --reset`
    );
  }
  await ensureDefaultOrganization();
  subscribeQuestEventHandlers();

  for (const person of PEOPLE) {
    check(
      await UserService.createUser(
        new UserService.User({
          userName: person.userName,
          displayName: person.displayName,
          email: `${person.userName}@example.com`,
          password: PASSWORD,
          phone: "",
          sms: false,
          authorizationLevel: person.level,
        })
      ),
      `creating ${person.userName}`
    );
  }
  // Sample addresses can't receive the verification email.
  await UserModel.updateMany({}, { $set: { emailVerifiedAt: new Date() } });

  check(
    await TeamService.createTeam({
      teamName: "reds",
      displayName: "The Reds",
      joinCode: "red-rover",
    }),
    "creating the team"
  );
  for (const member of ["alex", "blake"]) {
    check(
      await TeamService.addUserToTeam("reds", member, "red-rover"),
      `adding ${member} to the team`
    );
  }

  await mkdir(puzzleDataDirectory, { recursive: true });
  await QRCode.toFile(
    path.join(puzzleDataDirectory, MEDIA.picture),
    "Count the bridges you can see from the pier."
  );
  await writeFile(path.join(puzzleDataDirectory, MEDIA.sound), chime());

  const puzzles: PuzzleService.PuzzleDefinition[] = [
    {
      name: "lighthouse",
      displayName: "The Lighthouse",
      type: PuzzleType.TEXT,
      text: "I have a **lamp** but no room, and keep **watch** but never sleep. What am I?",
      solutionKeyword: "lighthouse",
      solutionDisplayText: "A lighthouse",
      hints: [
        {
          text: "Ships are glad of me.",
          timePenalty: 60,
          solutionWarning: false,
        },
        {
          text: "I stand where the land meets the sea.",
          timePenalty: 120,
          solutionWarning: false,
        },
      ],
    },
    {
      name: "skyline",
      displayName: "The Skyline",
      type: PuzzleType.IMAGE,
      text: `/puzzleData/${MEDIA.picture}`,
      solutionKeyword: "three",
      solutionDisplayText: "Three bridges",
      hints: [
        {
          text: "Scan it with any camera app.",
          timePenalty: 30,
          solutionWarning: false,
        },
      ],
    },
    {
      name: "chime",
      displayName: "The Chime",
      type: PuzzleType.AUDIO,
      text: `/puzzleData/${MEDIA.sound}`,
      solutionKeyword: "bell",
      solutionDisplayText: "A bell",
      hints: [
        { text: "Churches have one.", timePenalty: 60, solutionWarning: false },
        { text: "It's a bell.", timePenalty: 300, solutionWarning: true },
      ],
    },
    {
      name: "keys",
      displayName: "The Keys",
      type: PuzzleType.TEXT,
      text: "What has **keys** but opens no locks?",
      solutionKeyword: "piano",
      solutionDisplayText: "A piano",
      hints: [
        { text: "You can play me.", timePenalty: 60, solutionWarning: false },
      ],
    },
  ];
  for (const puzzle of puzzles) {
    check(await PuzzleService.createPuzzle(puzzle), `creating ${puzzle.name}`);
  }

  const quests: QuestService.QuestDefinition[] = [
    {
      name: "harbor-walk",
      displayName: "The Harbor Walk",
      assignee: { kind: "team", name: "reds" },
      puzzles: [
        { puzzleName: "lighthouse", activationCode: "HARBOR1" },
        { puzzleName: "skyline", activationCode: "HARBOR2" },
        { puzzleName: "chime", activationCode: "HARBOR3" },
      ],
    },
    {
      name: "old-town",
      displayName: "Old Town",
      assignee: { kind: "user", name: "drew" },
      puzzles: [
        { puzzleName: "keys", activationCode: "OLDTOWN1" },
        { puzzleName: "lighthouse", activationCode: "OLDTOWN2" },
      ],
    },
    {
      name: "museum-mile",
      displayName: "The Museum Mile",
      assignee: { kind: "user", name: "casey" },
      puzzles: [
        { puzzleName: "chime", activationCode: "MUSEUM1" },
        { puzzleName: "keys", activationCode: "MUSEUM2" },
      ],
    },
    {
      name: "first-steps",
      displayName: "First Steps",
      assignee: { kind: "user", name: "drew" },
      puzzles: [{ puzzleName: "keys", activationCode: "FIRST1" }],
    },
  ];
  for (const quest of quests) {
    check(await QuestService.createQuest(quest), `creating ${quest.name}`);
  }

  // The Harbor Walk is under way: the first stop solved, the second found,
  // with a hint revealed.
  const reds = await actingAs("alex");
  const admin = { actor: "admin" };
  check(
    await QuestService.startQuest("harbor-walk", admin),
    "starting harbor-walk"
  );
  check(
    await QuestService.activatePuzzle(
      "harbor-walk",
      "lighthouse",
      reds,
      "HARBOR1",
      { actor: "alex" }
    ),
    "activating lighthouse"
  );
  check(
    await QuestService.finishPuzzle(
      "harbor-walk",
      "lighthouse",
      reds,
      "a lighthouse",
      { actor: "alex" }
    ),
    "solving lighthouse"
  );
  check(
    await QuestService.activatePuzzle(
      "harbor-walk",
      "skyline",
      reds,
      "HARBOR2",
      { actor: "blake" }
    ),
    "activating skyline"
  );
  check(
    await QuestService.getPuzzleHint("harbor-walk", "skyline", reds, {
      actor: "blake",
    }),
    "revealing a hint"
  );

  // The Museum Mile is paused, on its first stop.
  const casey = await actingAs("casey");
  check(
    await QuestService.startQuest("museum-mile", admin),
    "starting museum-mile"
  );
  check(
    await QuestService.activatePuzzle(
      "museum-mile",
      "chime",
      casey,
      "MUSEUM1",
      { actor: "casey" }
    ),
    "activating chime"
  );
  check(
    await QuestService.pauseQuest("museum-mile", admin),
    "pausing museum-mile"
  );

  // First Steps is finished.
  const drew = await actingAs("drew");
  check(
    await QuestService.startQuest("first-steps", admin),
    "starting first-steps"
  );
  check(
    await QuestService.activatePuzzle("first-steps", "keys", drew, "FIRST1", {
      actor: "drew",
    }),
    "activating keys"
  );
  check(
    await QuestService.finishPuzzle("first-steps", "keys", drew, "piano", {
      actor: "drew",
    }),
    "solving keys"
  );
  // Old Town hasn't started.
}

/** What the seed made, for whoever ran it. */
export const SUMMARY = `Sample data is in place. Everyone's password is "${PASSWORD}".

  admin   administrator
  helper  staff
  alex    player, in The Reds with blake: The Harbor Walk, under way (codes HARBOR1-3)
  blake   player, in The Reds with alex
  casey   player: The Museum Mile, paused (codes MUSEUM1-2)
  drew    player: Old Town, not started (OLDTOWN1-2); First Steps, finished`;

// Run when started as a script, not when a test imports it.
if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  // The services' own log lines would bury the summary.
  redirectLog({ write: () => undefined });
  try {
    await mongoose.connect(config.PQ_MONGODB_URI);
    await seed(process.argv.includes("--reset"));
    process.stdout.write(`${SUMMARY}\n`);
  } catch (err) {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
