// The resources the v1 API returns, as schemas for its description and
// functions that make them from the services' objects.
import { z } from "zod";
import { QuestPuzzleStatus } from "../../models/quest.model.js";
import type * as QuestService from "../../services/quest.service.js";
import type * as PuzzleService from "../../services/puzzle.service.js";
import type * as TeamService from "../../services/team.service.js";
import type * as UserService from "../../services/user.service.js";

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
    authorizationLevel: z.number().int().meta({
      description:
        "What the user may do: 1 for a player, 5 for staff, 10 for an administrator.",
    }),
    teams: z.array(teamSummarySchema).optional().meta({
      description: "The teams the user is a member of, when getting one user.",
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
    authorizationLevel: user.authorizationLevel,
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

/** A puzzle, with its solution and hints; only administrators see these. */
export const puzzleSchema = z
  .object({
    name: z.string(),
    displayName: z.string(),
    type: z.number().int().meta({
      description: "0 for text, 1 for an image, 2 for audio, 3 for video.",
    }),
    text: z.string().meta({
      description:
        "Markdown, for a text puzzle; the media file's path, for the others.",
    }),
    solutionKeyword: z.string().meta({
      description:
        "The keywords a guess must contain, separated by commas; letter case, spacing, and punctuation don't matter.",
    }),
    solutionDisplayText: z
      .string()
      .meta({ description: "The solution as shown once it is solved." }),
    hints: z.array(
      z.object({
        text: z.string(),
        solutionWarning: z.boolean().meta({
          description: "True if the hint gives the solution away.",
        }),
        timePenalty: z.number().int().meta({
          description: "Seconds added to the players' time for revealing it.",
        }),
      })
    ),
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
    name: puzzle.name,
    displayName: puzzle.displayName,
    type: puzzle.type,
    text: puzzle.text,
    solutionKeyword: puzzle.solutionKeyword,
    solutionDisplayText: puzzle.solutionDisplayText,
    hints: puzzle.hints.map(({ text, solutionWarning, timePenalty }) => ({
      text,
      solutionWarning,
      timePenalty,
    })),
  };
}

/** A moment, in ISO 8601 format. */
const time = z.iso.datetime();

/** How long players have spent on part of a quest. */
const progressFields = {
  startTime: time.optional().meta({ description: "When the clock started." }),
  endTime: time.optional().meta({ description: "When the clock stopped." }),
  running: z.boolean().meta({
    description: "True while the clock runs: started, not stopped or paused.",
  }),
  clockStart: time.optional().meta({
    description:
      "While running, when the clock would have started if there had been no pauses: a page's clock counts up from here.",
  }),
  elapsedMs: z.number().meta({
    description: "Milliseconds on the clock, leaving out paused time.",
  }),
  penaltyMs: z.number().meta({
    description: "The revealed hints' time penalties, in milliseconds.",
  }),
  totalMs: z.number().meta({
    description: "The score: elapsed time plus penalties. Lower is better.",
  }),
};

/** One of a quest's puzzles, with the players' progress on it. */
const questPuzzleSchema = z
  .object({
    puzzleName: z.string(),
    displayName: z.string().optional(),
    status: z.number().int().meta({
      description:
        "0 not reached, 1 awaiting activation, 2 in progress, 3 completed.",
    }),
    statusDescription: z.string(),
    nextHintToDisplay: z
      .number()
      .int()
      .meta({ description: "How many hints have been revealed." }),
    activationCode: z
      .string()
      .optional()
      .meta({ description: "Only for administrators." }),
    cardWord: z.string().optional().meta({
      description:
        "The word or phrase on the stop's QR card, if it has one. Only for administrators.",
    }),
    activationTime: time.nullish(),
    startTime: time.nullish(),
    endTime: time.nullish(),
    skipped: z.boolean(),
    solutionDisplayText: z.string().optional().meta({
      description:
        "Shown to the players once the puzzle is completed; always to administrators.",
    }),
    hints: z
      .array(
        z.object({
          text: z.string(),
          solutionWarning: z.boolean(),
          timePenalty: z.number().int(),
        })
      )
      .optional()
      .meta({
        description:
          "The players see the hints they have revealed; administrators see them all.",
      }),
  })
  .meta({ id: "QuestPuzzle" });

/** Who plays one of a quest's entries. */
const entrantSchema = z
  .object({
    kind: z.enum(["user", "team"]),
    name: z.string().optional().meta({
      description:
        "The user name or team name; missing if the user or team has been deleted.",
    }),
    displayName: z.string().optional(),
  })
  .meta({ id: "QuestEntrant" });

/** How long an entry's players have spent on its quest, puzzle by puzzle. */
const questProgressSchema = z.object({
  ...progressFields,
  puzzles: z.array(z.object({ puzzleName: z.string(), ...progressFields })),
});

/**
 * One of a quest's entries: a user or team playing it, with its own
 * progress. Players see only their own entry, with only the puzzles they have
 * reached, and not the activation codes or the text reply it is waiting for.
 */
export const questEntrySchema = z
  .object({
    id: z.string().meta({ description: "The entry's ID." }),
    entrant: entrantSchema,
    status: z.number().int().meta({
      description: "0 not started, 1 in progress, 2 completed.",
    }),
    statusDescription: z.string(),
    paused: z.boolean(),
    textResponse: z.string().optional().meta({
      description:
        "The text message reply the entry is waiting for; only for administrators.",
    }),
    textResponseConfirmation: z.string().optional().meta({
      description:
        "What is sent back when the reply arrives; only for administrators.",
    }),
    puzzles: z.array(questPuzzleSchema),
    progress: questProgressSchema,
  })
  .meta({ id: "QuestEntry" });

/**
 * A quest: its definition and its entries, the users and teams playing it.
 * Administrators see every entry; a player sees only their own.
 */
export const questSchema = z
  .object({
    name: z.string(),
    displayName: z.string(),
    visibility: z.enum(["public", "private"]).optional().meta({
      description: "Who can follow the quest; only for administrators.",
    }),
    entries: z.array(questEntrySchema).meta({
      description:
        "The users and teams playing the quest, in order, each with its own progress. A player sees only their own entry.",
    }),
  })
  .meta({ id: "Quest" });

/**
 * Says who plays an entry, without the user's or team's ID.
 * @param quest the quest, as seen through the entry
 * @returns the entrant
 */
function entrantOf(quest: QuestService.Quest) {
  const { kind, name, displayName } = quest.assignee;
  return {
    kind,
    ...(name !== undefined ? { name } : {}),
    ...(displayName !== undefined ? { displayName } : {}),
  };
}

/**
 * Makes the resource for one of a quest's entries.
 * @param quest the quest, as seen through the entry
 * @param view who it's for: an administrator sees everything; a player, the
 *  puzzles as players see them, and not the text reply
 * @returns the resource
 */
function toQuestEntryResource(
  quest: QuestService.Quest,
  view: "admin" | "player"
) {
  return {
    id: quest.entryId,
    entrant: entrantOf(quest),
    status: quest.status,
    statusDescription: quest.statusDescription,
    paused: quest.paused,
    ...(view === "admin"
      ? {
          textResponse: quest.textResponse,
          textResponseConfirmation: quest.textResponseConfirmation,
        }
      : {}),
    puzzles: quest.puzzles.map((puzzle) =>
      view === "admin" ? puzzle.toJSON() : puzzle.toPlayerJSON()
    ),
    progress: quest.getProgress(),
  };
}

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
  return {
    name: quest.name,
    displayName: quest.displayName,
    ...(view === "admin" ? { visibility: quest.visibility } : {}),
    entries: entries.map((entry) => toQuestEntryResource(entry, view)),
  };
}

/** The time spent on a quest, on the puzzles reached so far. */
const reachedProgressSchema = z.object({
  ...progressFields,
  puzzles: z
    .array(z.object({ puzzleName: z.string(), ...progressFields }))
    .meta({ description: "The puzzles reached so far, in order." }),
});

/**
 * A quest in a list of a player's quests. It has the whole quest's progress and
 * nothing puzzle by puzzle, so it can't reveal how long the quest is.
 */
export const questSummarySchema = z
  .object({
    name: z.string(),
    displayName: z.string(),
    status: z.number().int().meta({
      description: "1 in progress, 2 completed.",
    }),
    statusDescription: z.string(),
    paused: z.boolean(),
    progress: z.object(progressFields),
  })
  .meta({ id: "QuestSummary" });

/**
 * Makes a quest's resource for a list of a player's quests.
 * @param quest the quest
 * @returns the resource, built field by field so that nothing else gets in
 */
export function toQuestSummaryResource(quest: QuestService.Quest) {
  const { puzzles: _puzzles, ...progress } = quest.getProgress();
  return {
    name: quest.name,
    displayName: quest.displayName,
    status: quest.status,
    statusDescription: quest.statusDescription,
    paused: quest.paused,
    progress,
  };
}

/** A hint that has been revealed. */
const revealedHintSchema = z.object({
  text: z.string(),
  timePenalty: z.number().int().meta({ description: "In seconds." }),
});

/**
 * A puzzle as its players see it, with what a player's screen needs of the
 * quest. It holds nothing about puzzles not yet reached, because players must
 * never learn how long a quest is.
 */
export const playerPuzzleSchema = z
  .object({
    quest: z.object({
      name: z.string(),
      displayName: z.string(),
      status: z.number().int().meta({
        description: "0 not started, 1 in progress, 2 completed.",
      }),
      statusDescription: z.string(),
      paused: z.boolean(),
      progress: reachedProgressSchema,
    }),
    puzzle: z.object({
      name: z.string(),
      displayName: z.string(),
      status: z.number().int().meta({
        description: "1 awaiting activation, 2 in progress, 3 completed.",
      }),
      statusDescription: z.string(),
      skipped: z.boolean(),
      stopNumber: z.number().int().meta({
        description:
          "The puzzle's place in the quest, counting from 1. How many stops are left is never shown.",
      }),
      type: z.number().int().nullable().meta({
        description:
          "0 text, 1 image, 2 audio, 3 video; null until the puzzle is activated.",
      }),
      text: z.string().nullable().meta({
        description:
          "The puzzle's Markdown, or the path of its media; null until the puzzle is activated.",
      }),
      hints: z
        .array(revealedHintSchema)
        .meta({ description: "The hints revealed so far." }),
      nextHint: z
        .object({
          timePenalty: z.number().int().meta({ description: "In seconds." }),
          solutionWarning: z.boolean().meta({
            description: "True if the hint gives the solution away.",
          }),
        })
        .nullable()
        .meta({
          description:
            "What revealing the next hint would cost; null if the puzzle isn't in progress or has no more hints.",
        }),
      solutionText: z.string().nullable().meta({
        description: "Null until the puzzle is completed.",
      }),
    }),
    next: z
      .object({ name: z.string(), displayName: z.string() })
      .nullable()
      .meta({
        description:
          "The puzzle after this one, once the players have reached it; otherwise null.",
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
  const progress = quest.getProgress();
  const stopIndex = reached.findIndex(
    ({ puzzleName }) => puzzleName === puzzle.puzzleName
  );
  const next = reached.at(stopIndex + 1);
  const activated = puzzle.status >= QuestPuzzleStatus.IN_PROGRESS;
  const nextHint =
    puzzle.status === QuestPuzzleStatus.IN_PROGRESS
      ? detail.hints[puzzle.nextHintToDisplay]
      : undefined;
  return {
    quest: {
      name: quest.name,
      displayName: quest.displayName,
      status: quest.status,
      statusDescription: quest.statusDescription,
      paused: quest.paused,
      progress: {
        ...progress,
        puzzles: progress.puzzles.filter(({ puzzleName }) =>
          reachedNames.has(puzzleName)
        ),
      },
    },
    puzzle: {
      name: puzzle.puzzleName,
      displayName: detail.displayName,
      status: puzzle.status,
      statusDescription: puzzle.statusDescription,
      skipped: puzzle.skipped,
      stopNumber: stopIndex + 1,
      type: activated ? detail.type : null,
      text: activated ? detail.text : null,
      hints: detail.hints
        .slice(0, puzzle.nextHintToDisplay)
        .map(({ text, timePenalty }) => ({ text, timePenalty })),
      nextHint: nextHint
        ? {
            timePenalty: nextHint.timePenalty,
            solutionWarning: nextHint.solutionWarning,
          }
        : null,
      solutionText:
        puzzle.status === QuestPuzzleStatus.COMPLETED
          ? detail.solutionDisplayText
          : null,
    },
    next: next
      ? {
          name: next.puzzleName,
          displayName: next.puzzleDetail?.displayName ?? next.puzzleName,
        }
      : null,
  };
}

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
    entrant: z.object({
      kind: z.enum(["user", "team"]),
      displayName: z.string().optional().meta({
        description: "Missing if the user or team has been deleted.",
      }),
    }),
    status: z.number().int().meta({
      description: "0 not started, 1 in progress, 2 completed.",
    }),
    statusDescription: z.string(),
    paused: z.boolean(),
    progress: reachedProgressSchema.meta({
      description:
        "The entry's time; its puzzles are empty when the quest's stopsHidden is true, leaving the totals: the standings.",
    }),
    puzzles: z
      .array(
        z.object({
          name: z.string(),
          displayName: z.string(),
          status: z.number().int().meta({
            description: "1 awaiting activation, 2 in progress, 3 completed.",
          }),
          statusDescription: z.string(),
          skipped: z.boolean(),
          activationTime: time.nullable(),
          solutionText: z.string().nullable().meta({
            description: "Null until the puzzle is completed.",
          }),
        })
      )
      .meta({
        description:
          "The puzzles the entry has reached, in order; empty when the quest's stopsHidden is true.",
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
    name: z.string(),
    displayName: z.string(),
    racing: z.boolean().meta({
      description:
        "True while the quest is a race that not every entry has finished: it has several entries, and not all have completed it. The same for every viewer.",
    }),
    stopsHidden: z.boolean().meta({
      description:
        "True if this view is the standings alone: while racing, for anyone but staff and administrators, every entry's puzzles and progress.puzzles are empty, so rivals can't read each other's puzzles and answers. Each entry's entrant, status, pause, and progress totals are still shown.",
    }),
    entries: z.array(spectatorQuestEntrySchema).meta({
      description:
        "The users and teams playing the quest, in order, each with its own progress.",
    }),
  })
  .meta({ id: "SpectatorQuest" });

/**
 * Leaves the stops out of an entry's progress when the viewer sees only the
 * standings.
 * @param progress the entry's progress
 * @param stopsHidden true to leave the stops out
 * @returns the progress
 */
function standingsOrAll<P extends { readonly puzzles: readonly unknown[] }>(
  progress: P,
  stopsHidden: boolean
): P {
  return stopsHidden ? { ...progress, puzzles: [] as const } : progress;
}

/**
 * Makes a quest's public resource.
 * @param spectated the quest as seen through each of its entries, from
 *  getSpectatedQuest, holding only reached puzzles (there is at least one),
 *  and whether the viewer sees only the standings
 * @returns the resource
 */
export function toSpectatorQuestResource({
  entries,
  racing,
  stopsHidden,
}: QuestService.SpectatedQuest) {
  const [quest] = entries;
  return {
    name: quest.name,
    displayName: quest.displayName,
    racing,
    stopsHidden,
    entries: entries.map((entry) => ({
      id: entry.entryId,
      entrant: {
        kind: entry.assignee.kind,
        ...(entry.assignee.displayName !== undefined
          ? { displayName: entry.assignee.displayName }
          : {}),
      },
      status: entry.status,
      statusDescription: entry.statusDescription,
      paused: entry.paused,
      progress: standingsOrAll(entry.getProgress(), stopsHidden),
      puzzles: (stopsHidden ? [] : entry.puzzles).map((puzzle) => ({
        name: puzzle.puzzleName,
        displayName: puzzle.puzzleDetail?.displayName ?? puzzle.puzzleName,
        status: puzzle.status,
        statusDescription: puzzle.statusDescription,
        skipped: puzzle.skipped,
        activationTime: puzzle.activationTime ?? null,
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
      name: z.string(),
      displayName: z.string(),
      paused: z.boolean(),
    }),
    puzzle: z.object({
      name: z.string(),
      displayName: z.string(),
      status: z.number().int().meta({
        description: "2 in progress, 3 completed.",
      }),
      statusDescription: z.string(),
      skipped: z.boolean(),
      type: z.number().int().meta({
        description: "0 text, 1 image, 2 audio, 3 video.",
      }),
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
      name: quest.name,
      displayName: quest.displayName,
      paused: quest.paused,
    },
    puzzle: {
      name: puzzle.puzzleName,
      displayName: detail.displayName,
      status: puzzle.status,
      statusDescription: puzzle.statusDescription,
      skipped: puzzle.skipped,
      type: detail.type,
      text: detail.text,
      hints: detail.hints
        .slice(0, puzzle.nextHintToDisplay)
        .map(({ text, timePenalty }) => ({ text, timePenalty })),
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
    type: z.string().meta({
      description:
        "What happened: QuestStarted, PuzzleActivated, PuzzleSolved, PuzzleStarted, HintRevealed, QuestCompleted, QuestReset, QuestPaused, QuestResumed, PuzzleSkipped, or PuzzleReset.",
    }),
    at: time,
    puzzleName: z.string().optional(),
    actor: z.string().optional().meta({
      description:
        "The user name of whoever acted; missing when the system did, such as on an incoming call, or when they have since deleted their account.",
    }),
    actorDeleted: z.boolean().optional().meta({
      description:
        "True when whoever acted has since deleted their account, which took their name out of the log.",
    }),
    entrant: z
      .object({
        kind: z.enum(["user", "team"]),
        name: z.string().optional().meta({
          description:
            "The user name or team name as it was at the time; missing if the user has since deleted their account, or the team was already deleted.",
        }),
      })
      .nullable()
      .meta({
        description:
          "The user or team whose entry it happened in; null for events logged before quests had several entries.",
      }),
    data: z
      .record(z.string(), z.unknown())
      .optional()
      .meta({ description: "Details particular to the type." }),
  })
  .meta({ id: "QuestEvent" });

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
  status: z.number().int().meta({
    description: "0 not started, 1 in progress, 2 completed.",
  }),
  statusDescription: z.string(),
  paused: z.boolean(),
};

/** One of a quest's entries in the list staff see, without its puzzles. */
export const staffQuestEntrySummarySchema = z
  .object({ ...staffEntryFields, progress: z.object(progressFields) })
  .meta({ id: "StaffQuestEntrySummary" });

/**
 * A quest in the list staff see: who plays it, and how each entry is going,
 * without its puzzles. Every field is listed on purpose, as for the public
 * views.
 */
export const staffQuestSummarySchema = z
  .object({
    name: z.string(),
    displayName: z.string(),
    entries: z.array(staffQuestEntrySummarySchema),
  })
  .meta({ id: "StaffQuestSummary" });

/**
 * One of a quest's entries as staff see it: every stop, in order, reached or
 * not, with its live status for the entry.
 */
export const staffQuestEntrySchema = z
  .object({
    ...staffEntryFields,
    progress: questProgressSchema,
    puzzles: z.array(
      z.object({
        name: z.string(),
        displayName: z.string(),
        status: z.number().int().meta({
          description:
            "0 not reached, 1 awaiting activation, 2 in progress, 3 completed.",
        }),
        statusDescription: z.string(),
        activationCode: z.string().meta({
          description:
            "The code that unlocks the stop, which staff show the players as a QR code.",
        }),
        skipped: z.boolean(),
        hintsRevealed: z.number().int(),
        hintCount: z.number().int(),
        activationTime: time.nullable(),
        startTime: time.nullable(),
        endTime: time.nullable(),
      })
    ),
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
    name: z.string(),
    displayName: z.string(),
    entries: z.array(staffQuestEntrySchema),
  })
  .meta({ id: "StaffQuest" });

/**
 * Makes the fields of an entry that every staff view has.
 * @param quest the quest, as seen through the entry
 * @returns the fields
 */
function staffEntryOf(quest: QuestService.Quest) {
  return {
    id: quest.entryId,
    entrant: entrantOf(quest),
    status: quest.status,
    statusDescription: quest.statusDescription,
    paused: quest.paused,
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
  return {
    name: quest.name,
    displayName: quest.displayName,
    entries: entries.map((entry) => {
      const { puzzles: _puzzles, ...progress } = entry.getProgress();
      return { ...staffEntryOf(entry), progress };
    }),
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
  return {
    name: quest.name,
    displayName: quest.displayName,
    entries: entries.map((entry) => ({
      ...staffEntryOf(entry),
      progress: entry.getProgress(),
      puzzles: entry.puzzles.map((puzzle) => ({
        name: puzzle.puzzleName,
        displayName: puzzle.puzzleDetail?.displayName ?? puzzle.puzzleName,
        status: puzzle.status,
        statusDescription: puzzle.statusDescription,
        activationCode: puzzle.activationCode,
        skipped: puzzle.skipped,
        hintsRevealed: puzzle.nextHintToDisplay,
        hintCount: puzzle.puzzleDetail?.hints.length ?? 0,
        activationTime: puzzle.activationTime ?? null,
        startTime: puzzle.startTime ?? null,
        endTime: puzzle.endTime ?? null,
      })),
    })),
  };
}
