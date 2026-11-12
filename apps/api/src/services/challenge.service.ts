// The puzzle master's messages and challenges (decision 0025). A challenge is
// a message whose answer the puzzle master waits for, with a confirmation the
// players show the venue's staff once they have it. Every challenge sent is
// kept with the quest, so it can be sent to the next team with one tap; each
// entry keeps the messages sent to it and its latest challenge, answered from
// the app or by text message, whichever comes first.
import mongoose, { Types } from "mongoose";
import {
  containsAllKeywords,
  parseSolutionKeywords,
} from "../domain/quest/solution.js";
import { unexpectedErrorResult } from "../errors.js";
import {
  type ChallengeChannel,
  MAX_ENTRY_MESSAGES,
  QuestModel,
} from "../models/quest.model.js";
import type { ServiceResult } from "../types.js";
import { noSuchEntryError } from "./quest.service.js";

/** A challenge's content: its message, the answer's keywords, and the confirmation. */
export interface ChallengeContent {
  message: string;
  /** The keywords a right answer contains, separated by commas. */
  answer: string;
  confirmation: string;
}

/** A challenge kept with a quest. */
export interface QuestChallenge extends ChallengeContent {
  id: string;
  createdAt: Date;
}

/** What became of an answer to a challenge. */
export type AnswerOutcome =
  | { outcome: "right"; confirmation: string; answeredAt: Date }
  | { outcome: "wrong" }
  /** No challenge is waiting: none was sent, or it has been answered. */
  | { outcome: "none" };

/**
 * Lists the challenges sent in a quest.
 * @param questName the quest
 * @returns the challenges, oldest first, or not-found
 */
export async function listChallenges(
  questName: string
): Promise<ServiceResult<QuestChallenge[]>> {
  const quest = await QuestModel.findOne(
    { name: questName },
    { challenges: 1 }
  ).lean();
  if (!quest) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `No quest named ${questName}`,
    };
  }
  return {
    status: "success",
    statusCode: 200,
    data: quest.challenges.map((challenge) => ({
      id: challenge._id.toString(),
      message: challenge.message,
      answer: challenge.answer,
      confirmation: challenge.confirmation,
      createdAt: challenge.createdAt,
    })),
  };
}

/**
 * Finds one of a quest's challenges.
 * @param questName the quest
 * @param challengeId the challenge's ID
 * @returns the challenge, or not-found
 */
export async function findChallenge(
  questName: string,
  challengeId: string
): Promise<ServiceResult<QuestChallenge>> {
  const listed = await listChallenges(questName);
  if (listed.status === "error") {
    return listed;
  }
  const challenge = listed.data.find(({ id }) => id === challengeId);
  if (!challenge) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `Quest ${questName} has no challenge ${challengeId}`,
    };
  }
  return { status: "success", statusCode: 200, data: challenge };
}

/**
 * Keeps a challenge with a quest, so it can be sent again; one the same as
 * a challenge already kept is that challenge.
 * @param questName the quest
 * @param content the challenge
 * @returns the kept challenge
 */
export async function keepChallenge(
  questName: string,
  content: ChallengeContent
): Promise<ServiceResult<QuestChallenge>> {
  const listed = await listChallenges(questName);
  if (listed.status === "error") {
    return listed;
  }
  const same = listed.data.find(
    (kept) =>
      kept.message === content.message &&
      kept.answer === content.answer &&
      kept.confirmation === content.confirmation
  );
  if (same) {
    return { status: "success", statusCode: 200, data: same };
  }
  const challenge = {
    _id: new Types.ObjectId(),
    ...content,
    createdAt: new Date(),
  };
  // A single update, so it can't conflict with players' progress.
  await QuestModel.updateOne(
    { name: questName },
    { $push: { challenges: challenge } }
  );
  return {
    status: "success",
    statusCode: 200,
    data: {
      id: challenge._id.toString(),
      ...content,
      createdAt: challenge.createdAt,
    },
  };
}

/**
 * Records a message as sent to an entry's players, and, if it sets a
 * challenge, makes that the challenge the entry waits to answer.
 * @param questName the quest
 * @param entryId the entry
 * @param text the message
 * @param challenge the challenge it sets, if it does
 * @returns success, or not-found if the entry has gone
 */
export async function recordMessage(
  questName: string,
  entryId: string,
  text: string,
  challenge?: QuestChallenge
): Promise<ServiceResult<undefined>> {
  if (!mongoose.isValidObjectId(entryId)) {
    return noSuchEntryError(questName);
  }
  const sentAt = new Date();
  const challengeId = challenge && new Types.ObjectId(challenge.id);
  let result;
  try {
    // A single update, so it can't conflict with players' progress.
    result = await QuestModel.updateOne(
      { name: questName, "entries._id": entryId },
      {
        $push: {
          "entries.$.messages": {
            $each: [{ text, sentAt, ...(challengeId ? { challengeId } : {}) }],
            $slice: -MAX_ENTRY_MESSAGES,
          },
        },
        ...(challenge && challengeId
          ? {
              $set: {
                "entries.$.challenge": {
                  challengeId,
                  message: challenge.message,
                  answer: challenge.answer,
                  confirmation: challenge.confirmation,
                  sentAt,
                },
              },
            }
          : {}),
      }
    );
  } catch (err) {
    return unexpectedErrorResult("recordMessage", err);
  }
  if (result.matchedCount === 0) {
    return noSuchEntryError(questName);
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Checks an answer to the challenge an entry waits for, by the rule puzzle
 * answers follow: it must contain every keyword, whatever its letter case,
 * accents, spacing, and punctuation. A right answer finishes the challenge
 * for the whole entry.
 * @param questName the quest
 * @param entryId the entry
 * @param answer the answer, as given
 * @param by who answered, and how
 * @returns what became of the answer, or not-found if the entry has gone
 */
export async function answerChallenge(
  questName: string,
  entryId: string,
  answer: string,
  by: { userId: string; via: ChallengeChannel }
): Promise<ServiceResult<AnswerOutcome>> {
  if (!mongoose.isValidObjectId(entryId)) {
    return noSuchEntryError(questName);
  }
  const quest = await QuestModel.findOne(
    { name: questName, "entries._id": entryId },
    { "entries.$": 1 }
  ).lean();
  const challenge = quest?.entries[0]?.challenge;
  if (!quest) {
    return noSuchEntryError(questName);
  }
  if (!challenge || challenge.answeredAt) {
    return { status: "success", statusCode: 200, data: { outcome: "none" } };
  }
  if (!containsAllKeywords(answer, parseSolutionKeywords(challenge.answer))) {
    return { status: "success", statusCode: 200, data: { outcome: "wrong" } };
  }
  const answeredAt = new Date();
  // Only the challenge that was checked, and only if no one has answered it
  // since: of two teammates answering at once, the second finds it answered.
  const recorded = await QuestModel.updateOne(
    {
      _id: quest._id,
      entries: {
        $elemMatch: {
          _id: entryId,
          "challenge.sentAt": challenge.sentAt,
          "challenge.answeredAt": { $exists: false },
        },
      },
    },
    {
      $set: {
        "entries.$.challenge.answeredAt": answeredAt,
        "entries.$.challenge.answeredBy": new Types.ObjectId(by.userId),
        "entries.$.challenge.answeredVia": by.via,
      },
    }
  );
  if (recorded.modifiedCount === 0) {
    // A teammate answered it first, or a new challenge replaced it.
    return { status: "success", statusCode: 200, data: { outcome: "none" } };
  }
  return {
    status: "success",
    statusCode: 200,
    data: {
      outcome: "right",
      confirmation: challenge.confirmation,
      answeredAt,
    },
  };
}
