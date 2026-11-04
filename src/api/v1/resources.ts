// The resources the v1 API returns, as schemas for its description and
// functions that make them from the services' objects.
import { z } from "zod";
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
        "What the user may do: 1 for a player, 10 for an administrator.",
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

/**
 * Gets the path of a resource in the v1 API.
 * @param segments the path's segments, such as "users" and a user name
 * @returns the path, such as /api/v1/users/player
 */
export function resourcePath(...segments: string[]): string {
  return `/api/v1/${segments.map(encodeURIComponent).join("/")}`;
}
