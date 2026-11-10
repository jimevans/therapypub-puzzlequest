import type { Types } from "mongoose";
import { PuzzleModel } from "../src/models/puzzle.model.js";
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

/**
 * Adds each puzzle's name to a stored quest's puzzles, which refer to their
 * puzzles by ID, so tests can find and check them by name.
 * @param quest the stored quest
 * @returns the quest, with each puzzle's name
 */
export async function withPuzzleNames<
  Q extends { puzzles: { puzzleId: Types.ObjectId }[] },
>(
  quest: Q
): Promise<
  Omit<Q, "puzzles"> & {
    puzzles: (Q["puzzles"][number] & { puzzleName: string })[];
  }
> {
  if (quest === null) {
    // A test checking that the quest is gone.
    return null as never;
  }
  const puzzles = await PuzzleModel.find(
    { _id: { $in: quest.puzzles.map((puzzle) => puzzle.puzzleId) } },
    { name: 1 }
  ).lean();
  const names = new Map(
    puzzles.map((puzzle) => [puzzle._id.toString(), puzzle.name])
  );
  return {
    ...quest,
    puzzles: quest.puzzles.map((puzzle) => ({
      ...puzzle,
      puzzleName: names.get(puzzle.puzzleId.toString()) ?? "(deleted)",
    })),
  };
}

/**
 * Gets the IDs of puzzles by name, for storing a quest directly. The puzzles
 * must exist.
 * @param puzzleNames the puzzles
 * @returns the IDs, in the same order
 */
export async function puzzleIdsOf(
  ...puzzleNames: string[]
): Promise<Types.ObjectId[]> {
  const ids: Types.ObjectId[] = [];
  for (const name of puzzleNames) {
    const puzzle = await PuzzleModel.findOne({ name }, { _id: 1 }).lean();
    if (!puzzle) {
      throw new Error(`puzzleIdsOf: no puzzle named ${name}`);
    }
    ids.push(puzzle._id);
  }
  return ids;
}

/**
 * Gets the ID of one of a stored quest's entries, for acting on an entry by
 * its ID. The quest must exist and have the entry.
 * @param questName the quest
 * @param index the entry's place in the quest's entries; the first if left
 *  out
 * @returns the entry's ID
 */
export async function entryIdOf(questName: string, index = 0): Promise<string> {
  const { QuestModel } = await import("../src/models/quest.model.js");
  const quest = await QuestModel.findOne({ name: questName }, { entries: 1 })
    .lean()
    .exec();
  const entry = quest?.entries[index];
  if (!entry) {
    throw new Error(`entryIdOf: quest ${questName} has no entry ${index}`);
  }
  return entry._id.toString();
}
