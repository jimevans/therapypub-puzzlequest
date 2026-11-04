import type { Types } from "mongoose";
import { TeamModel, UserModel } from "../src/models/user.model.js";

/**
 * Gets the IDs of users and teams by name, for tests acting as the players a
 * quest is assigned to: a player acts as themselves and as each of their
 * teams. The users and teams must exist.
 * @param names user names and team names
 * @returns the IDs, in the same order
 */
export async function assigneeIdsOf(...names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const name of names) {
    const found =
      (await UserModel.findOne({ userName: name }, { _id: 1 }).lean()) ??
      (await TeamModel.findOne({ teamName: name }, { _id: 1 }).lean());
    if (!found) {
      throw new Error(`assigneeIdsOf: no user or team named ${name}`);
    }
    ids.push(found._id.toString());
  }
  return ids;
}

/**
 * Gets the IDs of users by name, for listing them as a team's members. The
 * users must exist.
 * @param userNames the users
 * @returns the IDs, in the same order
 */
export async function userIdsOf(
  ...userNames: string[]
): Promise<Types.ObjectId[]> {
  const ids: Types.ObjectId[] = [];
  for (const userName of userNames) {
    const user = await UserModel.findOne({ userName }, { _id: 1 }).lean();
    if (!user) {
      throw new Error(`userIdsOf: no user named ${userName}`);
    }
    ids.push(user._id);
  }
  return ids;
}
