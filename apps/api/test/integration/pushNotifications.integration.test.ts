// Tests of the push notifications quests send as they're played, with fake
// senders in place of Apple's and Google's services, recording what each
// player's phone would be sent.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import type { PushNotification } from "../../src/schemas/pushNotifications.js";
import type { PushSender } from "../../src/push/types.js";

const { questEventBus } = await import("../../src/events/questEventBus.js");
const { sendPushNotifications, startPushNotifications, draftFor, ordinal } =
  await import("../../src/events/pushNotifications.js");
const { subscribeQuestEventHandlers } =
  await import("../../src/events/subscribers.js");
const { PuzzleModel } = await import("../../src/models/puzzle.model.js");
const { QuestModel } = await import("../../src/models/quest.model.js");
const { SessionModel } = await import("../../src/models/session.model.js");
const { TeamModel, UserModel } = await import("../../src/models/user.model.js");
const QuestService = await import("../../src/services/quest.service.js");
const SessionService = await import("../../src/services/session.service.js");
const PushService = await import("../../src/services/push.service.js");

let mongoServer: MongoMemoryServer | undefined;
let unsubscribe: () => void;
/** Each user's ID, and their team's, by user name. */
let ids: Record<string, string>;
/** What each player's phone was sent, by user name. */
let received: Record<string, PushNotification[]>;
let sender: {
  send: ReturnType<typeof vi.fn<PushSender["send"]>>;
  close: () => void;
};

const PLAYERS = ["ann", "bob", "cat"];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await SessionModel.init();
  unsubscribe = questEventBus.subscribe(sendPushNotifications);
}, 120000);

afterAll(async () => {
  unsubscribe();
  PushService.setPushSenders(undefined);
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    TeamModel.deleteMany({}),
    PuzzleModel.deleteMany({}),
    QuestModel.deleteMany({}),
    SessionModel.deleteMany({}),
  ]);
  const users = await UserModel.create(
    PLAYERS.map((userName) => ({
      userName,
      displayName: userName,
      email: `${userName}@example.com`,
      password: "hash",
    }))
  );
  ids = Object.fromEntries(
    users.map((user) => [user.userName, user._id.toString()])
  );
  // Ann and Bob play as a team; Cat plays alone.
  const team = await TeamModel.create({
    teamName: "harbor",
    displayName: "Harbor",
    joinCode: "join",
    memberIds: [ids.ann, ids.bob],
  });
  ids.harbor = team._id.toString();
  await PuzzleModel.create([
    {
      name: "riddle",
      displayName: "The Lighthouse",
      solutionKeyword: "piano",
      solutionDisplayText: "A piano",
      hints: [{ text: "It makes music", timePenalty: 60 }],
    },
    {
      name: "lantern",
      displayName: "The Lantern",
      solutionKeyword: "lantern",
      solutionDisplayText: "A lantern",
    },
  ]);

  // Each player's phone registered with a session of theirs.
  received = Object.fromEntries(PLAYERS.map((name) => [name, []]));
  sender = {
    send: vi.fn<PushSender["send"]>(async (target, notification) => {
      received[target.token].push(notification);
      return "sent";
    }),
    close: () => {},
  };
  PushService.setPushSenders({ ios: sender });
  for (const name of PLAYERS) {
    await SessionService.setPushTarget(
      await SessionService.createSession(ids[name]),
      { platform: "ios", token: name, environment: "production" }
    );
  }
});

/**
 * Makes a quest of the given stops for the given entrants.
 * @param entrants who plays it
 * @param stops its puzzles
 */
async function makeQuest(
  entrants: { kind: "user" | "team"; name: string }[],
  stops = ["riddle", "lantern"]
) {
  await QuestService.createQuest({
    name: "walk",
    displayName: "Harbor walk",
    entrants,
    puzzles: stops.map((puzzleName) => ({
      puzzleName,
      activationCode: `${puzzleName}-code`,
    })),
  });
}

const harbor = { kind: "team" as const, name: "harbor" };
const cat = { kind: "user" as const, name: "cat" };

/** Who a player plays as: themselves, and their team. */
const assigneeIdsOf = (name: string) =>
  name === "cat" ? [ids.cat] : [ids[name], ids.harbor];

/**
 * Activates and solves a stop, as a player does.
 * @param name the player
 * @param puzzleName the stop's puzzle, whose keyword is its answer
 */
async function solve(name: string, puzzleName: string) {
  await QuestService.activatePuzzle(
    "walk",
    puzzleName,
    assigneeIdsOf(name),
    `${puzzleName}-code`,
    { actor: name }
  );
  const answer = puzzleName === "riddle" ? "piano" : "lantern";
  const result = await QuestService.finishPuzzle(
    "walk",
    puzzleName,
    assigneeIdsOf(name),
    answer,
    { actor: name }
  );
  expect(result.status).toBe("success");
}

/** Forgets what was sent so far. */
function clearReceived() {
  for (const name of PLAYERS) {
    received[name] = [];
  }
  sender.send.mockClear();
}

describe("a quest's players are told", () => {
  it("when it starts", async () => {
    await makeQuest([harbor, cat]);

    await QuestService.startQuest("walk", { actor: "admin" });

    for (const name of PLAYERS) {
      expect(received[name]).toEqual([
        {
          category: "questStarted",
          questName: "walk",
          title: "Harbor walk",
          body: "The quest has begun. Head for your first stop.",
        },
      ]);
    }
  });

  it("when it starts without anyone acting, as by a phone call", async () => {
    await makeQuest([harbor]);

    await QuestService.startQuest("walk");

    expect(received.ann).toHaveLength(1);
    expect(received.bob).toHaveLength(1);
  });

  it("when the puzzle master pauses and resumes it", async () => {
    await makeQuest([harbor]);
    await QuestService.startQuest("walk");
    clearReceived();

    await QuestService.pauseQuest("walk", { actor: "admin" });
    await QuestService.resumeQuest("walk", { actor: "admin" });

    expect(received.ann).toEqual([
      {
        category: "questPaused",
        questName: "walk",
        title: "Harbor walk",
        body: "The puzzle master has paused the quest. The clock has stopped.",
      },
      {
        category: "questResumed",
        questName: "walk",
        title: "Harbor walk",
        body: "The quest is back on. The clock is running again.",
      },
    ]);
    expect(received.bob).toEqual(received.ann);
  });

  it("when a teammate solves a stop, without its solution", async () => {
    await makeQuest([harbor]);
    await QuestService.startQuest("walk");
    clearReceived();

    await solve("ann", "riddle");

    expect(received.bob).toEqual([
      {
        category: "stopSolved",
        questName: "walk",
        puzzleName: "riddle",
        title: "Harbor walk",
        body: "Your team solved The Lighthouse. On to the next stop.",
      },
    ]);
    expect(JSON.stringify(received.bob)).not.toMatch(/piano/i);
    // The solver already knows.
    expect(received.ann).toEqual([]);
  });

  it("when a teammate solves the last stop, finishing the quest", async () => {
    await makeQuest([harbor]);
    await QuestService.startQuest("walk");
    await solve("ann", "riddle");
    clearReceived();

    await solve("ann", "lantern");

    expect(received.bob).toEqual([
      expect.objectContaining({
        category: "stopSolved",
        puzzleName: "lantern",
        body: "Your team solved The Lantern and finished the quest.",
      }),
    ]);
  });
});

describe("a quest's players aren't told", () => {
  it("of activations or hints", async () => {
    await makeQuest([harbor]);
    await QuestService.startQuest("walk");
    clearReceived();

    await QuestService.activatePuzzle(
      "walk",
      "riddle",
      assigneeIdsOf("ann"),
      "riddle-code",
      { actor: "ann" }
    );
    await QuestService.getPuzzleHint("walk", "riddle", assigneeIdsOf("ann"), {
      actor: "ann",
    });

    expect(sender.send).not.toHaveBeenCalled();
  });

  it("of what they did alone", async () => {
    await makeQuest([cat]);
    await QuestService.startQuest("walk");
    clearReceived();

    await solve("cat", "riddle");

    expect(sender.send).not.toHaveBeenCalled();
  });

  it("of the puzzle master's skipping a stop", async () => {
    await makeQuest([harbor]);
    await QuestService.startQuest("walk");
    clearReceived();

    await QuestService.skipQuestPuzzle("walk", "riddle", { actor: "admin" });

    expect(sender.send).not.toHaveBeenCalled();
  });
});

describe("a race", () => {
  beforeEach(async () => {
    await makeQuest([harbor, cat], ["riddle"]);
    await QuestService.startQuest("walk");
    clearReceived();
  });

  it("tells no one the standings while anyone is still racing", async () => {
    await solve("ann", "riddle");

    expect(received.bob.map((sent) => sent.category)).toEqual(["stopSolved"]);
    expect(received.cat).toEqual([]);
  });

  it("tells every entry's players where they came once the last finishes", async () => {
    await solve("ann", "riddle");
    clearReceived();

    await solve("cat", "riddle");

    const standings = {
      category: "standingsFinal",
      questName: "walk",
      title: "Harbor walk",
      body: "The final standings are in: your team came 1st of 2.",
    };
    expect(received.ann).toEqual([standings]);
    expect(received.bob).toEqual([standings]);
    // Cat finished last, and so already knows.
    expect(received.cat).toEqual([]);
  });

  it("tells a player alone where they came, when someone else finishes last", async () => {
    await solve("cat", "riddle");
    clearReceived();

    await solve("bob", "riddle");

    expect(received.cat).toEqual([
      expect.objectContaining({
        category: "standingsFinal",
        body: "The final standings are in: you came 1st of 2.",
      }),
    ]);
    expect(received.ann.map((sent) => sent.category)).toEqual([
      "stopSolved",
      "standingsFinal",
    ]);
    expect(received.ann[1].body).toBe(
      "The final standings are in: your team came 2nd of 2."
    );
  });
});

describe("sending", () => {
  it("never holds up the action that caused it", async () => {
    await makeQuest([harbor]);
    // Apple's service never answers.
    sender.send.mockImplementation(() => new Promise(() => {}));
    unsubscribe();
    const unsubscribeAll = subscribeQuestEventHandlers();
    try {
      // It returns, though the notifications are still being sent.
      await QuestService.startQuest("walk");

      await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(2));
    } finally {
      unsubscribeAll();
      unsubscribe = questEventBus.subscribe(sendPushNotifications);
    }
  });

  it("logs, rather than fails, when the quest has gone", async () => {
    await expect(
      sendPushNotifications({
        questName: "gone",
        entry: { id: "x", assignee: { kind: "team", id: ids.harbor } },
        racing: false,
        events: [{ type: "QuestStarted", at: new Date() }],
      })
    ).resolves.toBeUndefined();
    startPushNotifications({
      questName: "gone",
      entry: { id: "x", assignee: { kind: "team", id: "not an id" } },
      racing: false,
      events: [{ type: "QuestStarted", at: new Date() }],
    });

    expect(sender.send).not.toHaveBeenCalled();
  });
});

describe("drafting", () => {
  it("sends nothing for what isn't news", () => {
    expect(
      draftFor({
        questName: "walk",
        entry: { id: "x", assignee: { kind: "team", id: "t" } },
        racing: false,
        events: [{ type: "QuestReset", at: new Date() }],
      })
    ).toBeUndefined();
  });

  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [101, "101st"],
    [111, "111th"],
  ])("writes %i as %s", (n, written) => {
    expect(ordinal(n)).toBe(written);
  });
});
