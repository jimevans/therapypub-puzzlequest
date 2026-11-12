// The resources the v1 API returns, as schemas for its description and
// functions that make them from the services' objects. The services work with
// what is stored, such as numbered statuses; these map it to the API's names
// and values (see decision 0023), so what is stored never has to change for
// the API's sake.
import { z } from "zod";
import type { Progress, QuestProgress } from "../../domain/quest/index.js";
import { QuestPuzzleStatus } from "../../models/quest.model.js";
import type * as ChallengeService from "../../services/challenge.service.js";
import type * as QuestService from "../../services/quest.service.js";
import { rankQuestEntries } from "../../services/quest.service.js";
import type * as PuzzleService from "../../services/puzzle.service.js";
import type * as TeamService from "../../services/team.service.js";
import type * as UserService from "../../services/user.service.js";
import {
  entrantKindSchema,
  puzzleTypeSchema,
  questEventTypeSchema,
  questStatusSchema,
  roleSchema,
  stopStatusSchema,
  toEntrantKind,
  toPuzzleType,
  toQuestEventType,
  toQuestStatus,
  toRole,
  toStopStatus,
} from "../../schemas/enums.js";
import {
  nextHintSchema,
  timePenaltySeconds,
  toNextHint,
} from "../../schemas/hints.js";

/** A moment, in ISO 8601 format. */
const time = z.iso.datetime();

/**
 * Formats a moment that may not have happened.
 * @param date the moment, if there is one
 * @returns it in ISO 8601 format, or null
 */
function timeOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/** The fields every view has that describe a status in words. */
const statusDescription = z.string().meta({
  description:
    "The status in English words, for display; the wording may change, so act on status instead.",
});

/** True while an entry is paused. */
const paused = z.boolean().meta({
  description:
    "True while an administrator has paused the entry: its clocks stop, and its players can't activate, guess, or reveal hints until it resumes. Its status stays inProgress.",
});

/** True if a stop was skipped. */
const skipped = z.boolean().meta({
  description:
    "True if an administrator skipped the stop for the entry, completing it with no penalty, rather than its players solving it.",
});

/** A team, as a user's list of teams shows it. */
export const teamSummarySchema = z
  .object({
    teamName: z.string(),
    displayName: z.string(),
  })
  .meta({ id: "TeamSummary" });

/** A user. Passwords are never included. */
export const userSchema = z
  .object({
    id: z.string().meta({ description: "The user's ID." }),
    userName: z.string(),
    displayName: z.string(),
    email: z.string(),
    emailVerified: z.boolean().meta({
      description: "True once the user has verified their email address.",
    }),
    phone: z.string().meta({
      description: "In E.164 format, such as +15551234567, or empty.",
    }),
    sms: z
      .boolean()
      .meta({ description: "True if the user accepts text messages." }),
    role: roleSchema,
    teams: z.array(teamSummarySchema).optional().meta({
      description:
        "The teams the user is a member of; only when getting one user.",
    }),
  })
  .meta({ id: "User" });
export type UserResource = z.infer<typeof userSchema>;

/**
 * Makes the resource for a user.
 * @param user the user, as stored or as the session shows them
 * @param teams the user's teams, to include them
 * @returns the resource
 */
export function toUserResource(
  user: UserService.User | UserService.SessionUser,
  teams?: { teamName: string; displayName: string }[]
): UserResource {
  return {
    // A user loaded from the database always has an ID.
    id: user.id ?? "",
    userName: user.userName,
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerified ?? false,
    phone: user.phone,
    sms: "sms" in user ? user.sms : user.allowSmsMessages,
    role: toRole(user.authorizationLevel),
    ...(teams
      ? {
          teams: teams.map(({ teamName, displayName }) => ({
            teamName,
            displayName,
          })),
        }
      : {}),
  };
}

/** A team. */
export const teamSchema = z
  .object({
    teamName: z.string(),
    displayName: z.string(),
    joinCode: z.string().optional().meta({
      description:
        "The code a user gives to join the team; only for administrators.",
    }),
    members: z
      .array(
        z.object({
          userName: z.string(),
          displayName: z.string(),
        })
      )
      .optional()
      .meta({ description: "The team's members; only for administrators." }),
  })
  .meta({ id: "Team" });
export type TeamResource = z.infer<typeof teamSchema>;

/**
 * Makes the resource for a team. Only administrators see its join code and
 * members: other users need only enough to choose a team to join.
 * @param team the team
 * @param members the members' names, by user ID (see describeMembers), for
 *  an administrator; omit for anyone else
 * @returns the resource
 */
export function toTeamResource(
  team: TeamService.Team,
  members?: Map<string, { userName: string; displayName: string }>
): TeamResource {
  return {
    teamName: team.teamName,
    displayName: team.displayName,
    ...(members
      ? {
          joinCode: team.joinCode,
          members: team.memberIds.flatMap((id) => {
            const member = members.get(id);
            return member ? [member] : [];
          }),
        }
      : {}),
  };
}

/** One of a puzzle's hints, as the puzzle defines it. */
const hintDefinitionSchema = z
  .object({
    text: z.string(),
    solutionWarning: z.boolean().meta({
      description: "True if the hint gives the solution away.",
    }),
    timePenaltySeconds: timePenaltySeconds.meta({
      description: "Seconds added to the players' time for revealing it.",
    }),
  })
  .meta({ id: "HintDefinition" });

/**
 * Makes the resources for a puzzle's hints.
 * @param hints the hints, as stored
 * @returns the resources
 */
function toHintDefinitions(
  hints: readonly PuzzleService.PuzzleHint[]
): z.infer<typeof hintDefinitionSchema>[] {
  return hints.map(({ text, solutionWarning, timePenalty }) => ({
    text,
    solutionWarning,
    timePenaltySeconds: timePenalty,
  }));
}

/** A puzzle, with its solution and hints; only administrators see these. */
export const puzzleSchema = z
  .object({
    puzzleName: z.string(),
    displayName: z.string(),
    type: puzzleTypeSchema,
    text: z.string().meta({
      description:
        "Markdown, for a text puzzle; the media file's path, for the others.",
    }),
    solutionKeyword: z.string().meta({
      description:
        "The keywords a guess must contain, separated by commas; letter case, spacing, and punctuation don't matter.",
    }),
    solutionText: z
      .string()
      .meta({ description: "The solution as shown once it is solved." }),
    hints: z.array(hintDefinitionSchema),
  })
  .meta({ id: "Puzzle" });
export type PuzzleResource = z.infer<typeof puzzleSchema>;

/**
 * Makes the resource for a puzzle.
 * @param puzzle the puzzle
 * @returns the resource
 */
export function toPuzzleResource(puzzle: PuzzleService.Puzzle): PuzzleResource {
  return {
    puzzleName: puzzle.name,
    displayName: puzzle.displayName,
    type: toPuzzleType(puzzle.type),
    text: puzzle.text,
    solutionKeyword: puzzle.solutionKeyword,
    solutionText: puzzle.solutionDisplayText,
    hints: toHintDefinitions(puzzle.hints),
  };
}

/** How long players have spent on part of a quest. */
const clockFields = {
  startTime: time.nullable().meta({
    description: "When the clock started; null until it has.",
  }),
  endTime: time.nullable().meta({
    description: "When the clock stopped; null until it has.",
  }),
  running: z.boolean().meta({
    description:
      "True while the clock runs: started, not stopped, and not paused.",
  }),
  clockStart: time.nullable().meta({
    description:
      "While running, when the clock would have started if there had been no pauses, so a client's clock can count up from here without asking again; null while not running.",
  }),
  elapsedMs: z.number().int().nonnegative().meta({
    description:
      "Milliseconds on the clock, leaving out paused time, as of the response.",
  }),
  penaltyMs: z.number().int().nonnegative().meta({
    description: "The revealed hints' time penalties, in milliseconds.",
  }),
  totalMs: z.number().int().nonnegative().meta({
    description: "The score: elapsed time plus penalties. Lower is better.",
  }),
};

/** How long players have spent on a quest, or on one of its stops. */
const clockSchema = z.object(clockFields).meta({
  id: "Clock",
  description:
    "How long an entry's players have spent on a quest, or on one of its stops.",
});
type ClockResource = z.infer<typeof clockSchema>;

/** How long players have spent on one of a quest's stops. */
const puzzleClockSchema = z
  .object({ puzzleName: z.string(), ...clockFields })
  .meta({
    id: "PuzzleClock",
    description: "How long an entry's players have spent on one stop.",
  });

/** How long players have spent on a quest, stop by stop. */
const progressSchema = z
  .object({
    ...clockFields,
    puzzles: z.array(puzzleClockSchema).meta({
      description:
        "Each stop's clock, in order. Views for players and the public have only the stops reached so far, and none when the view is the standings alone (see SpectatorQuest's stopsHidden).",
    }),
  })
  .meta({
    id: "Progress",
    description:
      "How long an entry's players have spent on a quest, overall and stop by stop.",
  });
type ProgressResource = z.infer<typeof progressSchema>;

/**
 * Makes the resource for a clock.
 * @param progress the progress, as the rules measure it
 * @returns the resource
 */
function toClock(progress: Progress): ClockResource {
  return {
    startTime: timeOrNull(progress.startTime),
    endTime: timeOrNull(progress.endTime),
    running: progress.running,
    clockStart: timeOrNull(progress.clockStart),
    elapsedMs: progress.elapsedMs,
    penaltyMs: progress.penaltyMs,
    totalMs: progress.totalMs,
  };
}

/**
 * Makes the resource for a quest's progress.
 * @param progress the progress, as the rules measure it
 * @param include which stops to include; all of them if left out
 * @returns the resource
 */
function toProgress(
  progress: QuestProgress,
  include: (puzzleName: string) => boolean = () => true
): ProgressResource {
  return {
    ...toClock(progress),
    puzzles: progress.puzzles
      .filter(({ puzzleName }) => include(puzzleName))
      .map((puzzle) => ({ puzzleName: puzzle.puzzleName, ...toClock(puzzle) })),
  };
}

/** An entry's place on its quest's leaderboard. */
const rankSchema = z.number().int().positive().nullable().meta({
  description:
    "The entry's place on the leaderboard, from 1, once it has completed the quest: entries are ranked by progress.totalMs, lowest first, and entries with the same total share a rank (1, 2, 2, 4). Null while it hasn't completed. Ranks are provisional until every entry has completed, since one still playing could beat them.",
});

/** How many hints of a stop have been revealed. */
const hintsRevealed = z.number().int().nonnegative().meta({
  description: "How many of the puzzle's hints the entry has revealed.",
});

/**
 * One of a quest's stops, with an entry's progress on it, as getQuest shows
 * it.
 */
const questPuzzleSchema = z
  .object({
    puzzleName: z.string(),
    displayName: z.string(),
    status: stopStatusSchema,
    statusDescription,
    hintsRevealed,
    activationCode: z
      .string()
      .optional()
      .meta({ description: "Only for administrators." }),
    cardWord: z.string().nullable().optional().meta({
      description:
        "The word or phrase on the stop's QR card; null if it has none. Only for administrators: absent for players.",
    }),
    activationTime: time.nullable().meta({
      description: "When the entry activated the stop; null until it has.",
    }),
    startTime: time.nullable().meta({
      description:
        "When the stop became the entry's next, to find and activate; null until it has.",
    }),
    endTime: time.nullable().meta({
      description: "When the entry completed the stop; null until it has.",
    }),
    skipped,
    solutionText: z.string().optional().meta({
      description:
        "The solution as shown once solved. Players see it once the stop is completed; administrators, always.",
    }),
    hints: z.array(hintDefinitionSchema).meta({
      description:
        "The puzzle's hints: for players, those revealed; for administrators, all of them.",
    }),
  })
  .meta({ id: "QuestPuzzle" });
type QuestPuzzleResource = z.infer<typeof questPuzzleSchema>;

/**
 * Makes the resource for one of a quest's stops, with an entry's progress on
 * it. Players don't see the activation code, which they get by scanning the
 * stop's QR code; the card word, which they collect on the printed cards; the
 * hints not yet revealed, which would avoid their penalties; or the solution,
 * until the stop is completed.
 * @param puzzle the stop, with the entry's progress
 * @param view who it's for
 * @returns the resource
 */
function toQuestPuzzleResource(
  puzzle: QuestService.QuestPuzzle,
  view: "admin" | "player"
): QuestPuzzleResource {
  const detail = puzzle.puzzleDetail;
  const hints = detail?.hints ?? [];
  const showSolution =
    view === "admin" || puzzle.status === QuestPuzzleStatus.COMPLETED;
  return {
    puzzleName: puzzle.puzzleName,
    displayName: detail?.displayName ?? puzzle.puzzleName,
    status: toStopStatus(puzzle.status),
    statusDescription: puzzle.statusDescription,
    hintsRevealed: puzzle.nextHintToDisplay,
    ...(view === "admin"
      ? {
          activationCode: puzzle.activationCode,
          cardWord: puzzle.cardWord || null,
        }
      : {}),
    activationTime: timeOrNull(puzzle.activationTime),
    startTime: timeOrNull(puzzle.startTime),
    endTime: timeOrNull(puzzle.endTime),
    skipped: puzzle.skipped,
    ...(showSolution
      ? { solutionText: detail?.solutionDisplayText ?? "" }
      : {}),
    hints: toHintDefinitions(
      view === "admin" ? hints : hints.slice(0, puzzle.nextHintToDisplay)
    ),
  };
}

/** Who plays one of a quest's entries. */
const entrantSchema = z
  .object({
    kind: entrantKindSchema,
    name: z.string().nullable().meta({
      description:
        "The user name or team name; null if the user or team has been deleted.",
    }),
    displayName: z.string().nullable().meta({
      description: "Null if the user or team has been deleted.",
    }),
  })
  .meta({ id: "Entrant" });

/** A message the puzzle master sent an entry's players. */
const entryMessageSchema = z
  .object({
    text: z.string(),
    sentAt: z.iso.datetime(),
    challenge: z.boolean().meta({
      description: "True if it set a challenge.",
    }),
  })
  .meta({ id: "EntryMessage" });

/**
 * The challenge the puzzle master last sent an entry: a message whose answer
 * the players send (POST /quests/{questName}/challenge/answers, or by text
 * message), and the confirmation a right answer shows them, for the venue's
 * staff.
 */
const entryChallengeSchema = z
  .object({
    challengeId: z.string().meta({
      description:
        "The quest's kept challenge it was sent from (see GET /quests/{questName}/challenges).",
    }),
    message: z.string(),
    sentAt: z.iso.datetime(),
    answeredAt: z.iso.datetime().nullable().meta({
      description: "When a player answered it rightly; null while it waits.",
    }),
    answeredVia: z.enum(["app", "sms"]).nullable().meta({
      description:
        "How the right answer came: in the app (or on the web), or by text message; null while it waits.",
    }),
    confirmation: z.string().optional().meta({
      description:
        "What a right answer shows the players, to show the venue's staff. Players see it once it has been answered; administrators always.",
    }),
    expectedResponse: z.string().optional().meta({
      description:
        "The keywords a right answer contains, separated by commas. Only for administrators: absent for players.",
    }),
  })
  .meta({ id: "EntryChallenge" });

/**
 * One of a quest's entries: a user or team playing it, with its own
 * progress. Players see only their own entry, with only the puzzles they have
 * reached, and not the activation codes or the text reply it is waiting for.
 */
export const questEntrySchema = z
  .object({
    id: z.string().meta({ description: "The entry's ID." }),
    entrant: entrantSchema,
    status: questStatusSchema,
    statusDescription,
    paused,
    textResponse: z.string().nullable().optional().meta({
      description:
        "The keywords of the challenge the entry is waiting to answer, if any; null if none (see challenge). Only for administrators: absent for players.",
    }),
    textResponseConfirmation: z.string().nullable().optional().meta({
      description:
        "The confirmation of the challenge the entry is waiting to answer; null if none is waiting (see challenge). Only for administrators: absent for players.",
    }),
    messages: z.array(entryMessageSchema).meta({
      description:
        "What the puzzle master has sent the entry's players, oldest first: the most recent 50. A reset clears them.",
    }),
    challenge: entryChallengeSchema.nullable().meta({
      description:
        "The challenge the puzzle master last sent the entry, answered or not; null if none has been sent since it started.",
    }),
    rank: rankSchema.optional().meta({
      description:
        "The entry's place on the leaderboard (see SpectatorQuestEntry's rank); null while it hasn't completed. Only for administrators: absent for players. Entries stay in the quest's order.",
    }),
    puzzles: z.array(questPuzzleSchema).meta({
      description:
        "The quest's stops, in order, with the entry's progress on each. Players see only those they have reached.",
    }),
    progress: progressSchema,
  })
  .meta({ id: "QuestEntry" });

/**
 * A quest: its definition and its entries, the users and teams playing it.
 * Administrators see every entry; a player sees only their own.
 */
export const questSchema = z
  .object({
    questName: z.string(),
    displayName: z.string(),
    visibility: z.enum(["public", "private"]).optional().meta({
      description:
        "Who can follow the quest: anyone, or only its players, staff, and holders of a share link. Only for administrators.",
    }),
    textPlayersWithApp: z.boolean().optional().meta({
      description:
        "Whether the puzzle master's messages are texted to players who have the app, as well as shown in it. Only for administrators.",
    }),
    entries: z.array(questEntrySchema).meta({
      description:
        "The users and teams playing the quest, in order, each with its own progress. A player sees only their own entry.",
    }),
  })
  .meta({ id: "Quest" });

/**
 * Ranks a quest's entries, for views that keep them in entry order.
 * @param entries the quest, as seen through each of its entries
 * @returns each entry's rank
 */
function ranksOf(
  entries: readonly QuestService.Quest[]
): Map<QuestService.Quest, number | null> {
  return new Map(
    rankQuestEntries(entries).entries.map(({ quest, rank }) => [quest, rank])
  );
}

/**
 * Says who plays an entry, without the user's or team's ID.
 * @param quest the quest, as seen through the entry
 * @returns the entrant
 */
function entrantOf(quest: QuestService.Quest): z.infer<typeof entrantSchema> {
  const { kind, name, displayName } = quest.assignee;
  return {
    kind: toEntrantKind(kind),
    name: name ?? null,
    displayName: displayName ?? null,
  };
}

/**
 * Makes the resource for one of a quest's entries.
 * @param quest the quest, as seen through the entry
 * @param view who it's for: an administrator sees everything; a player, the
 *  puzzles as players see them, and not the text reply
 * @param rank the entry's rank, for an administrator
 * @returns the resource
 */
function toQuestEntryResource(
  quest: QuestService.Quest,
  view: "admin" | "player",
  rank: number | null | undefined
) {
  return {
    id: quest.entryId,
    entrant: entrantOf(quest),
    status: toQuestStatus(quest.status),
    statusDescription: quest.statusDescription,
    paused: quest.paused,
    ...(view === "admin"
      ? {
          textResponse: quest.textResponse || null,
          textResponseConfirmation: quest.textResponseConfirmation || null,
          rank: rank ?? null,
        }
      : {}),
    messages: quest.messages.map((message) => ({
      text: message.text,
      sentAt: message.sentAt.toISOString(),
      challenge: Boolean(message.challengeId),
    })),
    challenge: toEntryChallengeResource(quest.challenge, view),
    puzzles: quest.puzzles.map((puzzle) => toQuestPuzzleResource(puzzle, view)),
    progress: toProgress(quest.getProgress()),
  };
}

/**
 * Makes the resource for an entry's challenge.
 * @param challenge the challenge, if one has been sent
 * @param view who it's for: players see the confirmation only once they've
 *  answered, and never the answer
 * @returns the resource, or null
 */
function toEntryChallengeResource(
  challenge: QuestService.EntryChallenge | undefined,
  view: "admin" | "player"
): z.infer<typeof entryChallengeSchema> | null {
  if (!challenge) {
    return null;
  }
  return {
    challengeId: challenge.challengeId.toString(),
    message: challenge.message,
    sentAt: challenge.sentAt.toISOString(),
    answeredAt: timeOrNull(challenge.answeredAt),
    answeredVia: challenge.answeredVia ?? null,
    ...(view === "admin" || challenge.answeredAt
      ? { confirmation: challenge.confirmation }
      : {}),
    ...(view === "admin" ? { expectedResponse: challenge.answer } : {}),
  };
}

/** A challenge kept with a quest, which can be sent again. */
export const questChallengeSchema = z
  .object({
    challengeId: z.string(),
    message: z.string(),
    expectedResponse: z.string().meta({
      description: "The keywords a right answer contains, separated by commas.",
    }),
    responseConfirmation: z.string().meta({
      description: "What a right answer shows the players.",
    }),
    createdAt: z.iso.datetime().meta({
      description: "When it was first sent.",
    }),
  })
  .meta({ id: "QuestChallenge" });

/**
 * Makes the resource for a challenge kept with a quest.
 * @param challenge the challenge
 * @returns the resource
 */
export function toQuestChallengeResource(
  challenge: ChallengeService.QuestChallenge
): z.infer<typeof questChallengeSchema> {
  return {
    challengeId: challenge.id,
    message: challenge.message,
    expectedResponse: challenge.answer,
    responseConfirmation: challenge.confirmation,
    createdAt: challenge.createdAt.toISOString(),
  };
}

/** What a right answer to a challenge shows the players. */
export const challengeAnswerSchema = z
  .object({
    confirmation: z.string().meta({
      description: "What to show the venue's staff.",
    }),
    answeredAt: z.iso.datetime(),
  })
  .meta({ id: "ChallengeAnswer" });

/**
 * Makes a quest's resource.
 * @param entries the quest, as seen through each of the entries to show, in
 *  order (from getQuestEntries); there is at least one
 * @param view who it's for: an administrator sees everything; a player, their
 *  own entry as players see it
 * @returns the resource
 */
export function toQuestResource(
  entries: readonly QuestService.Quest[],
  view: "admin" | "player"
) {
  const [quest] = entries;
  // A player sees only their own entry, so their rank can't be known here.
  const ranks = view === "admin" ? ranksOf(entries) : undefined;
  return {
    questName: quest.name,
    displayName: quest.displayName,
    ...(view === "admin"
      ? {
          visibility: quest.visibility,
          textPlayersWithApp: quest.textAppPlayers,
        }
      : {}),
    entries: entries.map((entry) =>
      toQuestEntryResource(entry, view, ranks?.get(entry))
    ),
  };
}

/**
 * A quest in a list of a player's quests. It has the whole quest's progress and
 * nothing puzzle by puzzle, so it can't reveal how long the quest is.
 */
export const questSummarySchema = z
  .object({
    questName: z.string(),
    displayName: z.string(),
    status: questStatusSchema,
    statusDescription,
    paused,
    progress: clockSchema,
  })
  .meta({ id: "QuestSummary" });

/**
 * Makes a quest's resource for a list of a player's quests.
 * @param quest the quest
 * @returns the resource, built field by field so that nothing else gets in
 */
export function toQuestSummaryResource(quest: QuestService.Quest) {
  return {
    questName: quest.name,
    displayName: quest.displayName,
    status: toQuestStatus(quest.status),
    statusDescription: quest.statusDescription,
    paused: quest.paused,
    progress: toClock(quest.getProgress()),
  };
}

/** A hint that has been revealed. */
const revealedHintSchema = z
  .object({
    text: z.string(),
    timePenaltySeconds: timePenaltySeconds.meta({
      description: "Seconds it added to the players' time.",
    }),
  })
  .meta({ id: "RevealedHint" });

/**
 * Makes the resources for the hints of a puzzle an entry has revealed.
 * @param puzzle the stop, with the entry's progress
 * @param detail the puzzle's definition
 * @returns the resources
 */
function revealedHintsOf(
  puzzle: QuestService.QuestPuzzle,
  detail: PuzzleService.Puzzle
): z.infer<typeof revealedHintSchema>[] {
  return detail.hints
    .slice(0, puzzle.nextHintToDisplay)
    .map(({ text, timePenalty }) => ({
      text,
      timePenaltySeconds: timePenalty,
    }));
}

/** The stop after one, once the players have reached it. */
export const nextStopSchema = z
  .object({ puzzleName: z.string(), displayName: z.string() })
  .meta({
    id: "NextStop",
    description: "The stop after this one, which the players have reached.",
  });

/** A puzzle's type, which players don't see until they activate it. */
const puzzleTypeOrNull = puzzleTypeSchema.nullable().meta({
  description: "Null until the puzzle is activated.",
});

/**
 * A puzzle as its players see it, with what a player's screen needs of the
 * quest. It holds nothing about puzzles not yet reached, because players must
 * never learn how long a quest is.
 */
export const playerPuzzleSchema = z
  .object({
    quest: z.object({
      questName: z.string(),
      displayName: z.string(),
      status: questStatusSchema,
      statusDescription,
      paused,
      progress: progressSchema,
    }),
    puzzle: z.object({
      puzzleName: z.string(),
      displayName: z.string(),
      status: stopStatusSchema,
      statusDescription,
      skipped,
      stopNumber: z.number().int().positive().meta({
        description:
          "The stop's place in the quest, counting from 1. How many stops are left is never shown.",
      }),
      type: puzzleTypeOrNull,
      text: z.string().nullable().meta({
        description:
          "The puzzle's Markdown, or the path of its media; null until the puzzle is activated.",
      }),
      hints: z
        .array(revealedHintSchema)
        .meta({ description: "The hints revealed so far." }),
      nextHint: nextHintSchema.nullable().meta({
        description:
          "What revealing the next hint would cost; null if the puzzle isn't in progress or has no more hints.",
      }),
      solutionText: z.string().nullable().meta({
        description: "Null until the puzzle is completed.",
      }),
    }),
    next: nextStopSchema.nullable().meta({
      description:
        "The stop after this one, once the players have reached it; otherwise null.",
    }),
  })
  .meta({ id: "PlayerPuzzle" });

/**
 * Makes a puzzle's resource as its players see it.
 * @param quest the quest
 * @param puzzle the quest's puzzle, which the players have reached
 * @param detail the puzzle's definition
 * @returns the resource
 */
export function toPlayerPuzzleResource(
  quest: QuestService.Quest,
  puzzle: QuestService.QuestPuzzle,
  detail: PuzzleService.Puzzle
) {
  const isReached = ({ status }: QuestService.QuestPuzzle) =>
    status > QuestPuzzleStatus.UNAVAILABLE;
  const reached = quest.puzzles.filter(isReached);
  const reachedNames = new Set(reached.map(({ puzzleName }) => puzzleName));
  const stopIndex = reached.findIndex(
    ({ puzzleName }) => puzzleName === puzzle.puzzleName
  );
  const next = reached.at(stopIndex + 1);
  const activated = puzzle.status >= QuestPuzzleStatus.IN_PROGRESS;
  return {
    quest: {
      questName: quest.name,
      displayName: quest.displayName,
      status: toQuestStatus(quest.status),
      statusDescription: quest.statusDescription,
      paused: quest.paused,
      progress: toProgress(quest.getProgress(), (name) =>
        reachedNames.has(name)
      ),
    },
    puzzle: {
      puzzleName: puzzle.puzzleName,
      displayName: detail.displayName,
      status: toStopStatus(puzzle.status),
      statusDescription: puzzle.statusDescription,
      skipped: puzzle.skipped,
      stopNumber: stopIndex + 1,
      type: activated ? toPuzzleType(detail.type) : null,
      text: activated ? detail.text : null,
      hints: revealedHintsOf(puzzle, detail),
      nextHint: toNextHint(
        puzzle.status === QuestPuzzleStatus.IN_PROGRESS
          ? detail.hints[puzzle.nextHintToDisplay]
          : undefined
      ),
      solutionText:
        puzzle.status === QuestPuzzleStatus.COMPLETED
          ? detail.solutionDisplayText
          : null,
    },
    next: next
      ? {
          puzzleName: next.puzzleName,
          displayName: next.puzzleDetail?.displayName ?? next.puzzleName,
        }
      : null,
  };
}

/** One of a quest's stops that an entry has reached, as the public sees it. */
const spectatorStopSchema = z
  .object({
    puzzleName: z.string(),
    displayName: z.string(),
    status: stopStatusSchema.meta({
      description:
        "Never notReached: the public sees only the stops an entry has reached.",
    }),
    statusDescription,
    skipped,
    activationTime: time.nullable().meta({
      description: "When the entry activated the stop; null until it has.",
    }),
    solutionText: z.string().nullable().meta({
      description: "Null until the stop is completed.",
    }),
  })
  .meta({ id: "SpectatorStop" });

/**
 * One of a quest's entries as the public sees it: who plays it, by display
 * name only, and the puzzles it has reached. Every field is listed here on
 * purpose: a new field on a quest stays private until it's added.
 */
export const spectatorQuestEntrySchema = z
  .object({
    id: z.string().meta({
      description:
        "The entry's ID, for following one of its puzzles with getSpectatorPuzzle.",
    }),
    entrant: z
      .object({
        kind: entrantKindSchema,
        displayName: z.string().nullable().meta({
          description: "Null if the user or team has been deleted.",
        }),
      })
      .meta({
        id: "SpectatorEntrant",
        description: "Who plays the entry, by display name only.",
      }),
    status: questStatusSchema,
    statusDescription,
    paused,
    rank: rankSchema,
    progress: progressSchema.meta({
      description:
        "The entry's time, with the stops it has reached; no stops when the quest's stopsHidden is true, leaving the totals: the standings.",
    }),
    puzzles: z.array(spectatorStopSchema).meta({
      description:
        "The stops the entry has reached, in order; empty when the quest's stopsHidden is true.",
    }),
  })
  .meta({ id: "SpectatorQuestEntry" });

/**
 * A quest as the public sees it. Anyone can look, including its players, so it
 * shows nothing more than they can see, and nothing about puzzles no entry has
 * reached. While teams race, it's the standings alone, for anyone but staff.
 */
export const spectatorQuestSchema = z
  .object({
    questName: z.string(),
    displayName: z.string(),
    racing: z.boolean().meta({
      description:
        "True while the quest is a race that not every entry has finished: it has several entries, and not all have completed it. The same for every viewer.",
    }),
    stopsHidden: z.boolean().meta({
      description:
        "True if this view is the standings alone: while racing, for anyone but staff and administrators, every entry's puzzles and progress.puzzles are empty, so rivals can't read each other's puzzles and answers. Each entry's entrant, status, pause, rank, and progress totals are still shown.",
    }),
    rivalsHidden: z.boolean().meta({
      description:
        "True if this view leaves out every entry but the viewer's own: while racing, for a signed-in player (not staff or an administrator) whose own entry hasn't completed the quest. They see the whole leaderboard once it has.",
    }),
    provisional: z.boolean().meta({
      description:
        "True while the ranks shown could still change: some entry has a rank, and some hasn't completed the quest yet, so could still beat it. Once every entry has completed, the ranks are final. Never true while rivalsHidden is.",
    }),
    entries: z.array(spectatorQuestEntrySchema).meta({
      description:
        "The users and teams playing the quest, each with its own progress, in leaderboard order: those that completed it, by rank; then those playing; then those yet to start; each of the last two in the quest's order.",
    }),
  })
  .meta({ id: "SpectatorQuest" });

/**
 * Makes a quest's public resource.
 * @param spectated the quest as seen through each of the entries the viewer
 *  may see, from getSpectatedQuest, in leaderboard order, holding only reached
 *  puzzles (there is at least one), and whether the viewer sees only the
 *  standings
 * @returns the resource
 */
export function toSpectatorQuestResource({
  entries,
  racing,
  stopsHidden,
  rivalsHidden,
  provisional,
}: QuestService.SpectatedQuest) {
  const [{ quest }] = entries;
  return {
    questName: quest.name,
    displayName: quest.displayName,
    racing,
    stopsHidden,
    rivalsHidden,
    provisional,
    entries: entries.map(({ quest: entry, progress, rank }) => ({
      id: entry.entryId,
      entrant: {
        kind: toEntrantKind(entry.assignee.kind),
        displayName: entry.assignee.displayName ?? null,
      },
      status: toQuestStatus(entry.status),
      statusDescription: entry.statusDescription,
      paused: entry.paused,
      rank,
      // The standings alone leave the stops out.
      progress: toProgress(progress, () => !stopsHidden),
      puzzles: (stopsHidden ? [] : entry.puzzles).map((puzzle) => ({
        puzzleName: puzzle.puzzleName,
        displayName: puzzle.puzzleDetail?.displayName ?? puzzle.puzzleName,
        status: toStopStatus(puzzle.status),
        statusDescription: puzzle.statusDescription,
        skipped: puzzle.skipped,
        activationTime: timeOrNull(puzzle.activationTime),
        solutionText:
          puzzle.status === QuestPuzzleStatus.COMPLETED
            ? (puzzle.puzzleDetail?.solutionDisplayText ?? null)
            : null,
      })),
    })),
  };
}

/**
 * A puzzle as the public sees it, once its players have activated it. As with
 * the quest, every field is listed on purpose.
 */
export const spectatorPuzzleSchema = z
  .object({
    quest: z.object({
      questName: z.string(),
      displayName: z.string(),
      paused,
    }),
    puzzle: z.object({
      puzzleName: z.string(),
      displayName: z.string(),
      status: stopStatusSchema.meta({
        description:
          "inProgress or completed: the puzzle is shown only once activated.",
      }),
      statusDescription,
      skipped,
      type: puzzleTypeSchema,
      text: z.string().meta({
        description: "The puzzle's Markdown, or the path of its media.",
      }),
      hints: z
        .array(revealedHintSchema)
        .meta({ description: "The hints revealed so far." }),
      solutionText: z.string().nullable().meta({
        description: "Null until the puzzle is completed.",
      }),
    }),
  })
  .meta({ id: "SpectatorPuzzle" });

/**
 * Makes a puzzle's public resource.
 * @param quest the quest
 * @param puzzle the quest's puzzle, which its players have activated
 * @param detail the puzzle's definition
 * @returns the resource
 */
export function toSpectatorPuzzleResource(
  quest: QuestService.Quest,
  puzzle: QuestService.QuestPuzzle,
  detail: PuzzleService.Puzzle
) {
  return {
    quest: {
      questName: quest.name,
      displayName: quest.displayName,
      paused: quest.paused,
    },
    puzzle: {
      puzzleName: puzzle.puzzleName,
      displayName: detail.displayName,
      status: toStopStatus(puzzle.status),
      statusDescription: puzzle.statusDescription,
      skipped: puzzle.skipped,
      type: toPuzzleType(detail.type),
      text: detail.text,
      hints: revealedHintsOf(puzzle, detail),
      solutionText:
        puzzle.status === QuestPuzzleStatus.COMPLETED
          ? detail.solutionDisplayText
          : null,
    },
  };
}

/** Something that happened in a quest, from its event log. */
export const questEventSchema = z
  .object({
    type: questEventTypeSchema,
    at: time,
    puzzleName: z.string().nullable().meta({
      description: "The puzzle it happened to; null for the whole quest's.",
    }),
    actor: z.string().nullable().meta({
      description:
        "The user name of whoever acted; null when the system did, such as on an incoming call, or when they have since deleted their account (see actorDeleted).",
    }),
    actorDeleted: z.boolean().meta({
      description:
        "True when whoever acted has since deleted their account, which took their name out of the log.",
    }),
    entrant: z
      .object({
        kind: entrantKindSchema,
        name: z.string().nullable().meta({
          description:
            "The user name or team name as it was at the time; null if the user has since deleted their account, or the team was already deleted.",
        }),
      })
      .nullable()
      .meta({
        description:
          "The user or team whose entry it happened in; null for events logged before quests had several entries.",
      }),
    data: z.record(z.string(), z.unknown()).nullable().meta({
      description:
        "Details particular to the type, or null if it has none: for hintRevealed, the hint's hintIndex (from 0) and timePenaltySeconds; for puzzleReset, refundedHints, how many revealed hints' penalties were refunded.",
    }),
  })
  .meta({ id: "QuestEvent" });
export type QuestEventResource = z.infer<typeof questEventSchema>;

/**
 * Makes the resource for an event from a quest's log.
 * @param event the event, as the log keeps it
 * @returns the resource
 */
export function toQuestEventResource(
  event: QuestService.LoggedQuestEvent
): QuestEventResource {
  const { timePenalty, ...data } = event.data ?? {};
  return {
    type: toQuestEventType(event.type),
    at: event.at.toISOString(),
    puzzleName: event.puzzleName || null,
    actor: event.actor || null,
    actorDeleted: event.actorDeleted ?? false,
    entrant: event.entrant?.kind
      ? {
          kind: toEntrantKind(event.entrant.kind),
          name: event.entrant.name || null,
        }
      : null,
    data: event.data
      ? {
          ...data,
          ...(timePenalty !== undefined
            ? { timePenaltySeconds: timePenalty }
            : {}),
        }
      : null,
  };
}

/**
 * Gets the path of a resource in the v1 API.
 * @param segments the path's segments, such as "users" and a user name
 * @returns the path, such as /api/v1/users/player
 */
export function resourcePath(...segments: string[]): string {
  return `/api/v1/${segments.map(encodeURIComponent).join("/")}`;
}

/** The fields of one of a quest's entries that every staff view has. */
const staffEntryFields = {
  id: z.string().meta({ description: "The entry's ID." }),
  entrant: entrantSchema,
  status: questStatusSchema,
  statusDescription,
  paused,
  rank: rankSchema.meta({
    description:
      "The entry's place on the leaderboard (see SpectatorQuestEntry's rank); null while it hasn't completed. Entries stay in the quest's order.",
  }),
};

/** One of a quest's entries in the list staff see, without its puzzles. */
export const staffQuestEntrySummarySchema = z
  .object({ ...staffEntryFields, progress: clockSchema })
  .meta({ id: "StaffQuestEntrySummary" });

/**
 * A quest in the list staff see: who plays it, and how each entry is going,
 * without its puzzles. Every field is listed on purpose, as for the public
 * views.
 */
export const staffQuestSummarySchema = z
  .object({
    questName: z.string(),
    displayName: z.string(),
    entries: z.array(staffQuestEntrySummarySchema),
  })
  .meta({ id: "StaffQuestSummary" });

/** One of a quest's stops, with an entry's progress on it, as staff see it. */
const staffStopSchema = z
  .object({
    puzzleName: z.string(),
    displayName: z.string(),
    status: stopStatusSchema,
    statusDescription,
    activationCode: z.string().meta({
      description:
        "The code that unlocks the stop, which staff show the players as a QR code.",
    }),
    skipped,
    hintsRevealed,
    hintCount: z.number().int().nonnegative().meta({
      description: "How many hints the puzzle has.",
    }),
    activationTime: time.nullable().meta({
      description: "When the entry activated the stop; null until it has.",
    }),
    startTime: time.nullable().meta({
      description:
        "When the stop became the entry's next, to find and activate; null until it has.",
    }),
    endTime: time.nullable().meta({
      description: "When the entry completed the stop; null until it has.",
    }),
  })
  .meta({ id: "StaffStop" });

/**
 * One of a quest's entries as staff see it: every stop, in order, reached or
 * not, with its live status for the entry.
 */
export const staffQuestEntrySchema = z
  .object({
    ...staffEntryFields,
    progress: progressSchema,
    puzzles: z.array(staffStopSchema),
  })
  .meta({ id: "StaffQuestEntry" });

/**
 * A quest as staff see it: each entry with every stop, in order, reached or
 * not, with its live status. Staff run things at the stops, so they need to
 * know what's coming, and they unlock each stop by showing its activation
 * code; but not how to solve it: no solutions, hint text, or the text reply
 * an entry waits for. Every field is listed on purpose.
 */
export const staffQuestSchema = z
  .object({
    questName: z.string(),
    displayName: z.string(),
    entries: z.array(staffQuestEntrySchema),
  })
  .meta({ id: "StaffQuest" });

/**
 * Makes the fields of an entry that every staff view has.
 * @param quest the quest, as seen through the entry
 * @param ranks each entry's rank
 * @returns the fields
 */
function staffEntryOf(
  quest: QuestService.Quest,
  ranks: Map<QuestService.Quest, number | null>
) {
  return {
    id: quest.entryId,
    entrant: entrantOf(quest),
    status: toQuestStatus(quest.status),
    statusDescription: quest.statusDescription,
    paused: quest.paused,
    rank: ranks.get(quest) ?? null,
  };
}

/**
 * Makes a quest's resource for the list staff see.
 * @param entries the quest, as seen through each of its entries; there is at
 *  least one
 * @returns the resource, built field by field so that nothing else gets in
 */
export function toStaffQuestSummaryResource(
  entries: readonly QuestService.Quest[]
) {
  const [quest] = entries;
  const ranks = ranksOf(entries);
  return {
    questName: quest.name,
    displayName: quest.displayName,
    entries: entries.map((entry) => ({
      ...staffEntryOf(entry, ranks),
      progress: toClock(entry.getProgress()),
    })),
  };
}

/**
 * Makes a quest's resource as staff see it.
 * @param entries the quest, as seen through each of its entries, with every
 *  puzzle and its details; there is at least one
 * @returns the resource, built field by field so that nothing else gets in
 */
export function toStaffQuestResource(entries: readonly QuestService.Quest[]) {
  const [quest] = entries;
  const ranks = ranksOf(entries);
  return {
    questName: quest.name,
    displayName: quest.displayName,
    entries: entries.map((entry) => ({
      ...staffEntryOf(entry, ranks),
      progress: toProgress(entry.getProgress()),
      puzzles: entry.puzzles.map((puzzle) => ({
        puzzleName: puzzle.puzzleName,
        displayName: puzzle.puzzleDetail?.displayName ?? puzzle.puzzleName,
        status: toStopStatus(puzzle.status),
        statusDescription: puzzle.statusDescription,
        activationCode: puzzle.activationCode,
        skipped: puzzle.skipped,
        hintsRevealed: puzzle.nextHintToDisplay,
        hintCount: puzzle.puzzleDetail?.hints.length ?? 0,
        activationTime: timeOrNull(puzzle.activationTime),
        startTime: timeOrNull(puzzle.startTime),
        endTime: timeOrNull(puzzle.endTime),
      })),
    })),
  };
}
