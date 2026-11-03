import { z } from "zod";
import { displayName, newName, requiredText } from "./common.js";

/** POST /api/team/create */
export const createTeamBody = z.object({
  teamName: newName,
  displayName: displayName.min(1, "Required"),
  joinCode: requiredText,
});
export type CreateTeamBody = z.infer<typeof createTeamBody>;

/** PUT /api/team/:teamName. Fields left out keep their stored values. */
export const updateTeamBody = z.object({
  displayName: displayName.optional(),
  joinCode: requiredText.optional(),
});
export type UpdateTeamBody = z.infer<typeof updateTeamBody>;

/** PUT /api/team/:teamName/member/:userName */
export const joinTeamBody = z.object({
  joinCode: requiredText,
});
export type JoinTeamBody = z.infer<typeof joinTeamBody>;
