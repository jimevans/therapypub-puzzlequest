// The messages of the live-update websocket (/api/updates), which pages
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
 * Sent first, in answer to "init": the connection's ID, which the page sends
 * with its own actions so their updates aren't sent back to it.
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
      "A message from the live-update websocket, /api/updates, to a page: which kind is in its message field.",
  });
export type LiveUpdate = z.infer<typeof liveUpdateSchema>;

/**
 * The message a page sends when it connects: the address of the page, whose
 * quest's updates it is sent.
 */
export const pageMessageSchema = z
  .object({
    message: z.literal("init"),
    url: z.url(),
  })
  .meta({
    id: "LiveUpdateSubscription",
    description:
      "The message a page sends to the live-update websocket when it connects, giving the page's address.",
  });
export type PageMessage = z.infer<typeof pageMessageSchema>;
