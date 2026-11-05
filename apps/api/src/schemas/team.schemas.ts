import { z } from "zod";
import { displayName, newName, requiredText } from "./common.js";

/** POST /api/v1/teams */
export const createTeamBody = z.object({
  teamName: newName,
  displayName: displayName.min(1, "Required"),
  joinCode: requiredText,
});
export type CreateTeamBody = z.infer<typeof createTeamBody>;

/** PATCH /api/v1/teams/{teamName}. Fields left out keep their stored values. */
export const updateTeamBody = z.object({
  displayName: displayName.optional(),
  joinCode: requiredText.optional(),
});
export type UpdateTeamBody = z.infer<typeof updateTeamBody>;

/** PUT /api/v1/teams/{teamName}/members/{userName} */
export const joinTeamBody = z.object({
  joinCode: requiredText,
});
export type JoinTeamBody = z.infer<typeof joinTeamBody>;
