import { z } from "zod";
import { entrantKindSchema, toAssigneeKind } from "./enums.js";
import { displayName, newName, requiredText, wholeNumber } from "./common.js";

/**
 * A puzzle in a quest's list. An activation code may be given to set or
 * change the puzzle's code; otherwise one is generated. Progress isn't
 * accepted: it changes only through the game's actions.
 */
const questPuzzle = z.object({
  puzzleName: requiredText,
  activationCode: z.string().optional(),
  cardWord: z
    .string()
    .trim()
    .max(40, "Must be 40 characters or fewer")
    .optional()
    .meta({
      description:
        "A word or phrase printed large on the stop's QR card, for a mini-game in which the players put the cards' words together. Empty removes it; left out, it stays as it is.",
    }),
});

/** A user or team playing a quest, by name. */
const entrant = z
  .object({
    kind: entrantKindSchema,
    name: requiredText.meta({ description: "The user name or team name." }),
  })
  .transform(({ kind, name }) => ({ kind: toAssigneeKind(kind), name }));

/**
 * The users and teams playing a quest, each with its own progress: several
 * race one another through the same stops.
 */
const entrants = z
  .array(entrant)
  .min(1, "At least one user or team must play the quest")
  .meta({
    description:
      "The users and teams playing the quest, in order; at least one. Each has its own progress through the same stops. A player may be in only one of them, as a user or in a team. On a change, those already playing keep their progress, new ones start out not started, and those left out are removed, which is allowed only before they start.",
  });

const visibility = z.enum(["public", "private"]).meta({
  description:
    "Who can follow the quest: anyone, or only its players (in any of its entries) and staff. New quests are public.",
});

const textPlayersWithApp = z.boolean().meta({
  description:
    "Whether the puzzle master's messages and challenges are texted to players who have the app, which shows them anyway, as well as to those who don't. New quests text them; turning it off saves texting them.",
});

/** POST /api/v1/quests */
export const createQuestBody = z
  .object({
    questName: newName,
    displayName: displayName.min(1, "Required"),
    visibility: visibility.optional(),
    textPlayersWithApp: textPlayersWithApp.optional(),
    entrants,
    puzzles: z.array(questPuzzle).default([]),
  })
  .transform(({ questName, textPlayersWithApp, ...definition }) => ({
    name: questName,
    ...definition,
    ...(textPlayersWithApp !== undefined
      ? { textAppPlayers: textPlayersWithApp }
      : {}),
  }));
export type CreateQuestBody = z.output<typeof createQuestBody>;

/**
 * PATCH /api/v1/quests/{questName}. Fields left out keep their stored values; leaving
 * out the puzzle list keeps the puzzles unchanged.
 */
export const updateQuestBody = z
  .object({
    displayName: displayName.min(1, "Required").optional(),
    visibility: visibility.optional(),
    textPlayersWithApp: textPlayersWithApp.optional(),
    entrants: entrants.optional(),
    puzzles: z.array(questPuzzle).optional(),
  })
  .transform(({ textPlayersWithApp, ...definition }) => ({
    ...definition,
    ...(textPlayersWithApp !== undefined
      ? { textAppPlayers: textPlayersWithApp }
      : {}),
  }));
export type UpdateQuestBody = z.output<typeof updateQuestBody>;

/**
 * The page's live-update connection, which the live update about the action
 * then leaves out: the page shows the result itself.
 */
export const connectionIdField = z.string().optional().meta({
  description:
    "The client's live-update connection, which isn't sent the update about this action: the client shows the result itself.",
});
const connectionId = connectionIdField;

/**
 * POST /api/v1/quests/{questName}/puzzles/{puzzleName}/activation, as JSON:
 * the activation code, typed.
 */
export const activatePuzzleBody = z.object({
  activationCode: z.string().optional().meta({
    description:
      "The code, typed, in any letter case; or scan its QR code instead.",
  }),
  connectionId,
});
export type ActivatePuzzleBody = z.infer<typeof activatePuzzleBody>;

/**
 * The same, as multipart (parsed by multer): the text fields sent with a
 * camera frame of the stop's QR code, the frame's size among them.
 */
export const scannedActivationFields = z.object({
  width: wholeNumber.positive().optional(),
  height: wholeNumber.positive().optional(),
  connectionId,
});
export type ScannedActivationFields = z.infer<typeof scannedActivationFields>;

/** POST /api/v1/quests/{questName}/puzzles/{puzzleName}/solution-attempts */
export const solvePuzzleBody = z.object({
  guess: z.string().max(1000, "Must be at most 1000 characters"),
  connectionId,
});
export type SolvePuzzleBody = z.infer<typeof solvePuzzleBody>;

/** POST /api/v1/quests/{questName}/puzzles/{puzzleName}/hints */
export const requestHintBody = z.object({ connectionId });
export type RequestHintBody = z.infer<typeof requestHintBody>;

/** POST /api/v1/quests/{questName}/teams/{teamName}/puzzles/{puzzleName}/reset, and for players */
export const resetPuzzleBody = z.object({
  /** True to remove the penalties of the puzzle's revealed hints. */
  refundHints: z.boolean().default(false),
});
export type ResetPuzzleBody = z.infer<typeof resetPuzzleBody>;
