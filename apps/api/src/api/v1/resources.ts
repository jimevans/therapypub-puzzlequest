// The resources the v1 API returns, as schemas for its description and
// functions that make them from the services' objects.
import { z } from "zod";
import { QuestPuzzleStatus } from "../../models/quest.model.js";
import type * as QuestService from "../../services/quest.service.js";
import type * as PuzzleService from "../../services/puzzle.service.js";
import type * as TeamService from "../../services/team.service.js";
import type * as UserService from "../../services/user.service.js";

/** A team, as a user's list of teams shows it. */
const teamSummarySchema = z
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

/**
 * A quest. Players see only the puzzles they have reached, and not the
 * activation codes or the text reply the quest is waiting for.
 */
export const questSchema = z
  .object({
    name: z.string(),
    displayName: z.string(),
    assignee: z.object({
      kind: z.enum(["user", "team"]),
      id: z.string(),
      name: z.string().optional().meta({
        description: "Missing if the user or team has been deleted.",
      }),
      displayName: z.string().optional(),
    }),
    status: z.number().int().meta({
      description: "0 not started, 1 in progress, 2 completed.",
    }),
    statusDescription: z.string(),
    paused: z.boolean(),
    textResponse: z.string().optional().meta({
      description:
        "The text message reply the quest is waiting for; only for administrators.",
    }),
    textResponseConfirmation: z.string().optional().meta({
      description:
        "What is sent back when the reply arrives; only for administrators.",
    }),
    puzzles: z.array(questPuzzleSchema),
    progress: z.object({
      ...progressFields,
      puzzles: z.array(z.object({ puzzleName: z.string(), ...progressFields })),
    }),
  })
  .meta({ id: "Quest" });

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
 * A quest as the public sees it. Anyone can look, including its players, so it
 * shows nothing more than they can see, and nothing about puzzles not yet
 * reached. Every field is listed here on purpose: a new field on a quest stays
 * private until it's added.
 */
export const spectatorQuestSchema = z
  .object({
    name: z.string(),
    displayName: z.string(),
    status: z.number().int().meta({
      description: "0 not started, 1 in progress, 2 completed.",
    }),
    statusDescription: z.string(),
    paused: z.boolean(),
    progress: reachedProgressSchema,
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
      .meta({ description: "The puzzles reached so far, in order." }),
  })
  .meta({ id: "SpectatorQuest" });

/**
 * Makes a quest's public resource.
 * @param quest the quest, from getSpectatedQuest, holding only reached puzzles
 * @returns the resource
 */
export function toSpectatorQuestResource(quest: QuestService.Quest) {
  return {
    name: quest.name,
    displayName: quest.displayName,
    status: quest.status,
    statusDescription: quest.statusDescription,
    paused: quest.paused,
    progress: quest.getProgress(),
    puzzles: quest.puzzles.map((puzzle) => ({
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
        "The user name of whoever acted; missing when the system did, such as on an incoming call.",
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

/** Who a quest is for, as staff see it. */
const staffAssigneeSchema = z.object({
  kind: z.enum(["user", "team"]),
  name: z.string().optional().meta({
    description: "Missing if the user or team has been deleted.",
  }),
  displayName: z.string().optional(),
});

/**
 * A quest in the list staff see: who it's for, and how it's going, without its
 * puzzles. Every field is listed on purpose, as for the public views.
 */
export const staffQuestSummarySchema = z
  .object({
    name: z.string(),
    displayName: z.string(),
    assignee: staffAssigneeSchema,
    status: z.number().int().meta({
      description: "0 not started, 1 in progress, 2 completed.",
    }),
    statusDescription: z.string(),
    paused: z.boolean(),
    progress: z.object(progressFields),
  })
  .meta({ id: "StaffQuestSummary" });

/**
 * A quest as staff see it: every stop, in order, reached or not, with its live
 * status. Staff run things at the stops, so they need to know what's coming,
 * but not how to solve it: no solutions, activation codes, hint text, or the
 * text reply the quest waits for. Every field is listed on purpose.
 */
export const staffQuestSchema = z
  .object({
    name: z.string(),
    displayName: z.string(),
    assignee: staffAssigneeSchema,
    status: z.number().int().meta({
      description: "0 not started, 1 in progress, 2 completed.",
    }),
    statusDescription: z.string(),
    paused: z.boolean(),
    progress: z.object({
      ...progressFields,
      puzzles: z.array(z.object({ puzzleName: z.string(), ...progressFields })),
    }),
    puzzles: z.array(
      z.object({
        name: z.string(),
        displayName: z.string(),
        status: z.number().int().meta({
          description:
            "0 not reached, 1 awaiting activation, 2 in progress, 3 completed.",
        }),
        statusDescription: z.string(),
        skipped: z.boolean(),
        hintsRevealed: z.number().int(),
        hintCount: z.number().int(),
        activationTime: time.nullable(),
        startTime: time.nullable(),
        endTime: time.nullable(),
      })
    ),
  })
  .meta({ id: "StaffQuest" });

/**
 * Says who a quest is for, as staff see it.
 * @param quest the quest
 * @returns the assignee, without its ID
 */
function staffAssigneeOf(quest: QuestService.Quest) {
  const { kind, name, displayName } = quest.assignee;
  return { kind, name, displayName };
}

/**
 * Makes a quest's resource for the list staff see.
 * @param quest the quest
 * @returns the resource, built field by field so that nothing else gets in
 */
export function toStaffQuestSummaryResource(quest: QuestService.Quest) {
  const { puzzles: _puzzles, ...progress } = quest.getProgress();
  return {
    name: quest.name,
    displayName: quest.displayName,
    assignee: staffAssigneeOf(quest),
    status: quest.status,
    statusDescription: quest.statusDescription,
    paused: quest.paused,
    progress,
  };
}

/**
 * Makes a quest's resource as staff see it.
 * @param quest the quest, with every puzzle and its details
 * @returns the resource, built field by field so that nothing else gets in
 */
export function toStaffQuestResource(quest: QuestService.Quest) {
  return {
    name: quest.name,
    displayName: quest.displayName,
    assignee: staffAssigneeOf(quest),
    status: quest.status,
    statusDescription: quest.statusDescription,
    paused: quest.paused,
    progress: quest.getProgress(),
    puzzles: quest.puzzles.map((puzzle) => ({
      name: puzzle.puzzleName,
      displayName: puzzle.puzzleDetail?.displayName ?? puzzle.puzzleName,
      status: puzzle.status,
      statusDescription: puzzle.statusDescription,
      skipped: puzzle.skipped,
      hintsRevealed: puzzle.nextHintToDisplay,
      hintCount: puzzle.puzzleDetail?.hints.length ?? 0,
      activationTime: puzzle.activationTime ?? null,
      startTime: puzzle.startTime ?? null,
      endTime: puzzle.endTime ?? null,
    })),
  };
}
