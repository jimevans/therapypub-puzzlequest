// The messages of the live-update websocket (/api/v1/updates), which clients
// showing a quest use to follow it as it happens. The server checks each
// message it sends against these schemas, so a message can't drift from
// what the pages expect, and the API's description documents them.
import { z } from "zod";

/** A moment, in ISO 8601 format. */
const time = z.iso.datetime();

/** The names of the quest and puzzle a message is about. */
const aboutPuzzle = {
  questName: z.string(),
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
 * The puzzle master changed the quest, such as pausing it or skipping a
 * puzzle; the page reloads to show it.
 */
const questUpdated = z.object({
  message: z.literal("questUpdated"),
  questName: z.string(),
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
  ])
  .meta({
    id: "LiveUpdate",
    description:
      "A message from the live-update websocket, /api/v1/updates, to a client: which kind is in its message field.",
  });
export type LiveUpdate = z.infer<typeof liveUpdateSchema>;

/** A message from the server about a quest, which is every one but the first. */
export type QuestUpdate = Exclude<LiveUpdate, { message: "connection" }>;

/** The message a client sends to follow a quest: every update of it. */
export const liveUpdateSubscriptionSchema = z
  .object({
    message: z.literal("subscribe"),
    questName: z.string().min(1),
    ticket: z.string().min(1).meta({
      description:
        "A ticket from POST /quests/{name}/live-tickets, which can be used once.",
    }),
  })
  .meta({
    id: "LiveUpdateSubscription",
    description:
      "The message a client sends to the live-update websocket to follow a quest. Sending another follows that quest instead. A ticket that isn't valid for the quest closes the connection.",
  });
export type LiveUpdateSubscription = z.infer<
  typeof liveUpdateSubscriptionSchema
>;
