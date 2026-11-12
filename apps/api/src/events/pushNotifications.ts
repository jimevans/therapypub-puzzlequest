// Push notifications for what happens in a quest (decision 0024), to the
// phones of the entry's players: when it starts, is paused or resumed, when a
// teammate solves a stop, and, at the end of a race, the final standings.
// Never to the player whose action caused them, who already sees it.
//
// What a notification shows can be read on a locked phone by anyone holding
// it, so it never shows a solution or a hint, never says how many stops a
// quest has, and never tells a racing player how a rival is doing: the
// standings are sent only once every entry has finished.
import { log } from "../logger.js";
import { UserModel } from "../models/user.model.js";
import type { PushNotification } from "../schemas/pushNotifications.js";
import {
  type AssigneeRef,
  playersOf,
} from "../services/playerUpdates.service.js";
import * as PushService from "../services/push.service.js";
import * as QuestService from "../services/quest.service.js";
import type { QuestActivity } from "./questEventBus.js";

/** A notification to send, before it's addressed to anyone. */
type Draft = Omit<PushNotification, "questName" | "title">;

/**
 * Writes a number as an English ordinal: 1st, 2nd, 3rd, 4th, 11th, 22nd.
 * @param n the number, from 1
 * @returns the ordinal
 */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  return `${n}${suffix}`;
}

/**
 * How a notification addresses an entry's players.
 * @param assignee who plays the entry
 * @returns "Your team" for a team, "You" for a player alone
 */
function whoPlays(assignee: AssigneeRef): string {
  return assignee.kind === "team" ? "Your team" : "You";
}

/**
 * Decides what the entry's players are told of an activity, apart from the
 * standings: one notification at most, for the event that matters most.
 * @param activity the activity
 * @returns the notification, or undefined if there's nothing to tell
 */
export function draftFor(activity: QuestActivity): Draft | undefined {
  const { events } = activity;
  const who = whoPlays(activity.entry.assignee);
  const solved = events.find((event) => event.type === "PuzzleSolved");
  if (solved) {
    const finished = events.some((event) => event.type === "QuestCompleted");
    return {
      category: "stopSolved",
      puzzleName: solved.puzzleName,
      body: finished
        ? `${who} solved ${solved.displayName} and finished the quest.`
        : `${who} solved ${solved.displayName}. On to the next stop.`,
    };
  }
  for (const event of events) {
    switch (event.type) {
      case "QuestStarted":
        return {
          category: "questStarted",
          body: "The quest has begun. Head for your first stop.",
        };
      case "QuestPaused":
        return {
          category: "questPaused",
          body: "The puzzle master has paused the quest. The clock has stopped.",
        };
      case "QuestResumed":
        return {
          category: "questResumed",
          body: "The quest is back on. The clock is running again.",
        };
    }
  }
  return undefined;
}

/**
 * Finds the ID of the user who acted, so they can be left out.
 * @param actor their user name, if a user acted
 * @returns their ID, or undefined
 */
async function actorId(actor: string | undefined): Promise<string | undefined> {
  if (!actor) {
    return undefined;
  }
  const user = await UserModel.findOne({ userName: actor }, { _id: 1 }).lean();
  return user?._id.toString();
}

/**
 * Sends the push notifications an activity calls for, and waits for them.
 * The bus waits for its handlers before the action's request is answered,
 * so it's subscribed through startPushNotifications, which doesn't.
 * @param activity the activity
 */
export async function sendPushNotifications(
  activity: QuestActivity
): Promise<void> {
  const draft = draftFor(activity);
  const raceOver =
    !activity.racing &&
    activity.events.some((event) => event.type === "QuestCompleted");
  if (!draft && !raceOver) {
    return;
  }
  const found = await QuestService.getQuestEntries(activity.questName);
  if (found.status === "error") {
    log().warn(
      { questName: activity.questName },
      "push notifications weren't sent: the quest wasn't found"
    );
    return;
  }
  const entries = found.data;
  const title = entries[0]?.displayName || activity.questName;
  const excluded = await actorId(activity.actor);
  const recipients = async (assignee: AssigneeRef) =>
    (await playersOf([assignee])).filter((id) => id !== excluded);

  const sends: Promise<number>[] = [];
  if (draft) {
    sends.push(
      PushService.sendPush(await recipients(activity.entry.assignee), {
        ...draft,
        questName: activity.questName,
        title,
      })
    );
  }
  // A race is over when its last entry finishes: every entry's players hear
  // where they came. A quest with one entry isn't a race.
  if (raceOver && entries.length > 1) {
    const standings = QuestService.rankQuestEntries(entries);
    for (const { quest, rank } of standings.entries) {
      if (rank === null) {
        continue;
      }
      const joint =
        standings.entries.filter((other) => other.rank === rank).length > 1;
      sends.push(
        PushService.sendPush(await recipients(quest.assignee), {
          category: "standingsFinal",
          questName: activity.questName,
          title,
          body: `The final standings are in: ${whoPlays(quest.assignee).toLowerCase()} came ${joint ? "joint " : ""}${ordinal(rank)} of ${entries.length}.`,
        })
      );
    }
  }
  await Promise.all(sends);
}

/**
 * Starts sending an activity's push notifications without waiting for them,
 * so Apple's and Google's services never slow the action that caused them.
 * Failures are logged.
 * @param activity the activity
 */
export function startPushNotifications(activity: QuestActivity): void {
  sendPushNotifications(activity).catch((err: unknown) =>
    log().error(
      { err, questName: activity.questName },
      "push notifications weren't sent"
    )
  );
}
