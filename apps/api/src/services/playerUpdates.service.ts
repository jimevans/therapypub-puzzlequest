// Telling players' home screens that their list of quests changed, as when a
// phone call or the puzzle master starts one. A quest is assigned to a user or
// a team, so a team's quest tells each of its members.
import { Types } from "mongoose";
import type { AssigneeKind } from "../models/quest.model.js";
import { TeamModel } from "../models/user.model.js";
import { log } from "../logger.js";
import { hasUserFollowers, notifyUserFollowers } from "./websocket.service.js";

/** Whom a quest is assigned to. */
export interface AssigneeRef {
  kind: AssigneeKind;
  id: string | Types.ObjectId;
}

/**
 * Finds the users a quest's assignees stand for.
 * @param assignees the assignees
 * @returns the users' IDs
 */
export async function playersOf(
  assignees: readonly AssigneeRef[]
): Promise<string[]> {
  const userIds = assignees
    .filter((assignee) => assignee.kind === "user")
    .map((assignee) => assignee.id.toString());
  const teamIds = assignees
    .filter((assignee) => assignee.kind === "team")
    .map((assignee) => new Types.ObjectId(assignee.id.toString()));
  if (teamIds.length) {
    const teams = await TeamModel.find(
      { _id: { $in: teamIds } },
      { memberIds: 1 }
    ).lean();
    userIds.push(
      ...teams.flatMap((team) => team.memberIds.map((id) => id.toString()))
    );
  }
  return userIds;
}

/**
 * Tells the players of quests' assignees that their lists of quests changed.
 * It never fails: the change has already been saved, and a home screen that
 * misses this still refreshes itself before long.
 * @param assignees the assignees; undefined ones, of unassigned quests, are
 *  left out
 */
export async function notifyPlayersOf(
  assignees: readonly (AssigneeRef | undefined | null)[]
): Promise<void> {
  if (!hasUserFollowers()) {
    return;
  }
  try {
    notifyUserFollowers(
      await playersOf(
        assignees.filter((assignee): assignee is AssigneeRef =>
          Boolean(assignee)
        )
      )
    );
  } catch (err) {
    log().error({ err }, "telling players their quests changed failed");
  }
}
