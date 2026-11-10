// Moves each quest's progress into an entry. Until competitive quests, a
// quest stored one assignee and its progress beside its stops; now the quest
// holds the stops (puzzles, activation codes, card words) and a list of
// entries, each a user or team with its own progress. Run at startup, before
// serving: it changes only quests still in the old shape, so running it again
// does nothing.
import { Types } from "mongoose";
import { log } from "../logger.js";
import { QuestModel } from "./quest.model.js";

/** A stop as it was stored, with its progress beside it. */
interface OldStop {
  _id?: Types.ObjectId;
  puzzleId: Types.ObjectId;
  activationCode?: string;
  cardWord?: string;
  nextHintToDisplay?: number;
  status?: number;
  startTime?: Date;
  endTime?: Date;
  activationTime?: Date;
  skipped?: boolean;
  penaltyFreeHints?: number;
}

/** A quest as it was stored, before entries. */
interface OldQuest {
  _id: Types.ObjectId;
  assignee?: { kind: string; id: Types.ObjectId };
  status?: number;
  textResponse?: string;
  textResponseConfirmation?: string;
  pauses?: { startTime: Date; endTime?: Date }[];
  puzzles?: OldStop[];
}

/** Copies only the times that are set, as the schema stores them. */
function timesOf(stop: OldStop) {
  return {
    ...(stop.startTime ? { startTime: stop.startTime } : {}),
    ...(stop.activationTime ? { activationTime: stop.activationTime } : {}),
    ...(stop.endTime ? { endTime: stop.endTime } : {}),
  };
}

/**
 * Gives every quest still in the old shape its one entry.
 * @returns how many quests were changed
 */
export async function moveQuestProgressIntoEntries(): Promise<number> {
  const quests = QuestModel.collection.find<OldQuest>({
    entries: { $exists: false },
  });
  let moved = 0;
  for await (const quest of quests) {
    const stops = quest.puzzles ?? [];
    const entry = {
      _id: new Types.ObjectId(),
      assignee: quest.assignee,
      status: quest.status ?? 0,
      textResponse: quest.textResponse ?? "",
      textResponseConfirmation: quest.textResponseConfirmation ?? "",
      pauses: quest.pauses ?? [],
      puzzles: stops.map((stop) => ({
        puzzleId: stop.puzzleId,
        nextHintToDisplay: stop.nextHintToDisplay ?? 0,
        status: stop.status ?? 0,
        ...timesOf(stop),
        skipped: stop.skipped ?? false,
        penaltyFreeHints: stop.penaltyFreeHints ?? 0,
      })),
    };
    const result = await QuestModel.collection.updateOne(
      { _id: quest._id, entries: { $exists: false } },
      {
        $set: {
          // A quest with no one assigned (which the application never
          // stored) has no entry.
          entries: quest.assignee ? [entry] : [],
          puzzles: stops.map((stop) => ({
            ...(stop._id ? { _id: stop._id } : {}),
            puzzleId: stop.puzzleId,
            activationCode: stop.activationCode ?? "",
            ...(stop.cardWord ? { cardWord: stop.cardWord } : {}),
          })),
        },
        $unset: {
          assignee: "",
          status: "",
          textResponse: "",
          textResponseConfirmation: "",
          pauses: "",
        },
        // Anyone holding the old quest can't save over the new one.
        $inc: { __v: 1 },
      }
    );
    moved += result.modifiedCount;
  }
  // Players' quests are now found through their entries.
  const indexes = await QuestModel.collection.indexes().catch(() => []);
  if (indexes.some((index) => index.name === "assignee.id_1")) {
    await QuestModel.collection.dropIndex("assignee.id_1");
  }
  if (moved > 0) {
    log().info({ quests: moved }, "moved quests' progress into entries");
  }
  return moved;
}
