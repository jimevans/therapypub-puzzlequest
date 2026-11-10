// The messages of the live-update websocket (/api/v1/updates), which clients
// showing a quest use to follow it as it happens. The server checks each
// message it sends against these schemas, so a message can't drift from
// what the pages expect, and the API's description documents them.
import { z } from "zod";

/** A moment, in ISO 8601 format. */
const time = z.iso.datetime();

/** The entry of a quest whose progress a message is about. */
const entryId = z.string().meta({
  description:
    "The ID of the quest's entry whose progress changed: a quest can have several users or teams playing it, each with its own progress.",
});

/** The quest, entry, and puzzle a message is about. */
const aboutPuzzle = {
  questName: z.string(),
  entryId,
  puzzleName: z.string(),
};

/**
 * Sent first, in answer to "subscribe": the connection's ID, which the client
 * sends with its own actions so their updates aren't sent back to it.
 */
const connection = z.object({
  message: z.literal("connection"),
  connectionId: z.string(),
});

/** A puzzle was activated; it is in progress. */
const puzzleActivated = z.object({
  message: z.literal("puzzleActivated"),
  ...aboutPuzzle,
  activationTime: time,
});

/** A puzzle was solved. */
const puzzleSolved = z.object({
  message: z.literal("puzzleSolved"),
  ...aboutPuzzle,
  solutionText: z.string(),
  endTime: time,
  questComplete: z
    .literal(true)
    .optional()
    .meta({ description: "Present when it was the quest's last puzzle." }),
});

/**
 * The next puzzle became available, waiting to be found and activated; sent
 * to the pages of the puzzle just solved.
 */
const puzzleStarted = z.object({
  message: z.literal("puzzleStarted"),
  ...aboutPuzzle,
  displayName: z.string(),
  startTime: time,
});

/** A hint was revealed; its penalty adds to the players' time. */
const hintRequested = z.object({
  message: z.literal("hintRequested"),
  ...aboutPuzzle,
  hintText: z.string(),
  moreHints: z.boolean(),
  timePenalty: z.number().int().meta({ description: "In seconds." }),
  isNextHintSolution: z.boolean(),
});

/**
 * The puzzle master changed an entry's progress, such as pausing it or
 * skipping a puzzle; the page reloads to show it.
 */
const questUpdated = z.object({
  message: z.literal("questUpdated"),
  questName: z.string(),
  entryId,
});

/**
 * The quests the user, or their teams, play changed: one started, moved on,
 * or ended, was paused, reset, given other entrants, or deleted, or the user
 * joined or left a team. Sent to clients following the user's quests, which
 * fetch the list again; it says nothing about which quest it was.
 */
const questsChanged = z.object({
  message: z.literal("questsChanged"),
});

/** A message the server sends to a page. */
export const liveUpdateSchema = z
  .discriminatedUnion("message", [
    connection,
    puzzleActivated,
    puzzleSolved,
    puzzleStarted,
    hintRequested,
    questUpdated,
    questsChanged,
  ])
  .meta({
    id: "LiveUpdate",
    description:
      "A message from the live-update websocket, /api/v1/updates, to a client: which kind is in its message field.",
  });
export type LiveUpdate = z.infer<typeof liveUpdateSchema>;

/** A message from the server about a quest. */
export type QuestUpdate = Exclude<
  LiveUpdate,
  { message: "connection" | "questsChanged" }
>;

const ticket = z.string().min(1);

/** The message a client sends to follow what a ticket allows. */
export const liveUpdateSubscriptionSchema = z
  .union([
    z.strictObject({
      message: z.literal("subscribe"),
      questName: z.string().min(1),
      ticket: ticket.meta({
        description:
          "A ticket from POST /quests/{name}/live-tickets, which can be used once.",
      }),
    }),
    z.strictObject({
      message: z.literal("subscribe"),
      userName: z.string().min(1),
      ticket: ticket.meta({
        description:
          "A ticket from POST /users/{userName}/live-tickets, which can be used once.",
      }),
    }),
  ])
  .meta({
    id: "LiveUpdateSubscription",
    description:
      "The message a client sends to the live-update websocket: with questName, to follow every update of a quest; with userName, to hear when the list of quests the user plays changes. Sending another follows that instead. A ticket that isn't valid for it closes the connection.",
  });
export type LiveUpdateSubscription = z.infer<
  typeof liveUpdateSubscriptionSchema
>;
