import { setTimeout } from "timers/promises";
import Twilio from "twilio";
import { config } from "../config.js";
import { QuestModel, QuestStatus } from "../models/quest.model.js";
import * as QuestService from "../services/quest.service.js";
import { TeamModel, UserModel } from "../models/user.model.js";
import * as UserService from "../services/user.service.js";
import * as ChallengeService from "./challenge.service.js";
import * as PushService from "./push.service.js";
import * as SessionService from "./session.service.js";
import * as WebSocketService from "./websocket.service.js";
import type { ServiceResult } from "../types.js";
import { unexpectedErrorResult } from "../errors.js";

/** A quest's entry, by the quest's name and the entry's ID. */
export interface QuestEntryRef {
  questName: string;
  entryId: string;
}

/** The reply to an incoming call, and the quests' entries the call starts. */
export interface VoiceCallResponse {
  /** The TwiML that tells Twilio what to say to the caller. */
  response: string;
  /** The entries to start, now that the caller has phoned in. */
  questsToActivate?: QuestEntryRef[];
}

/**
 * Builds the reply to an incoming phone call. A known caller whose entries in
 * quests (their own, or their team's) haven't started is told they are
 * starting; the entries are returned so the caller can start them.
 * @param initiatingPhoneNumber the caller's number in E.164 format, from Twilio, if not hidden
 * @returns the TwiML reply and the quests to start
 */
export async function respondToVoiceCall(
  initiatingPhoneNumber: string | undefined
): Promise<ServiceResult<VoiceCallResponse>> {
  const voiceResponse = new Twilio.twiml.VoiceResponse();
  if (!initiatingPhoneNumber) {
    // If the number's caller ID is hidden, respond with an error message.
    voiceResponse.say(
      {
        voice: "Polly.Emma",
        language: "en-GB",
      },
      "Congratulations! You have reached the puzzle master. You may have quests awaiting activation, but you have hidden your phone number from caller ID. Please contact an administrator for assistance."
    );
    return {
      status: "success",
      statusCode: 200,
      data: { response: voiceResponse.toString() },
    };
  }

  const getUserResponse = await UserService.getUsersByPhoneNumber(
    initiatingPhoneNumber
  );
  if (getUserResponse.status === "error") {
    // If there are no users with the incoming phone number, reject the call.
    voiceResponse.reject({ reason: "rejected" });
    return {
      status: "success",
      statusCode: 200,
      data: { response: voiceResponse.toString() },
    };
  }
  const questNames: QuestEntryRef[] = [];
  for (const user of getUserResponse.data) {
    // Gets the entries of the user and any teams the user is a member of.
    const assigneeIds = await user.getAssigneeIds();
    const findOptions = { assigneeIds };
    const getQuestsResponse = await QuestService.findQuests(findOptions);
    if (getQuestsResponse.status === "success") {
      // Only the entries not yet started are started.
      const userEntries = getQuestsResponse.data
        .filter((quest) => quest.status === QuestStatus.NOT_STARTED)
        .map((quest) => ({ questName: quest.name, entryId: quest.entryId }));
      questNames.push(...userEntries);
    }
  }
  const responseMessage = questNames.length
    ? "Congratulations! You have reached the puzzle master. Your quest starts now. Sign in to the puzzle quest dot com to begin. Save this number in your contacts, and good luck."
    : "The puzzle master says you have no quests waiting to start.";
  voiceResponse.say(
    {
      voice: "Polly.Emma",
      language: "en-GB",
    },
    responseMessage
  );
  return {
    status: "success",
    statusCode: 200,
    data: { response: voiceResponse.toString(), questsToActivate: questNames },
  };
}

/**
 * Builds the reply to an incoming text message, as an answer to the
 * challenge the sender's entries in quests in progress (their own, or their
 * team's) are waiting for.
 * @param initiatingPhoneNumber the sender's number in E.164 format, from Twilio
 * @param incomingMessage the text of the message
 * @returns the TwiML reply
 */
export async function respondToTextMessage(
  initiatingPhoneNumber: string,
  incomingMessage: string
): Promise<ServiceResult<string>> {
  const messageBody = incomingMessage.trim();
  const messageResponse = new Twilio.twiml.MessagingResponse();
  const reply = (text: string) => {
    messageResponse.message(
      `From the PuzzleQuest Game\n\n${text}\n\nReply 'STOP' to unsubscribe`
    );
    return {
      status: "success" as const,
      statusCode: 200,
      data: messageResponse.toString(),
    };
  };
  const getUserResult = await UserService.getUsersByPhoneNumber(
    initiatingPhoneNumber
  );
  if (getUserResult.status === "error") {
    return reply("You are not a registered user of this service");
  }
  const waiting: { quest: QuestService.Quest; userId: string }[] = [];
  for (const user of getUserResult.data) {
    // Gets the entries of the user and any teams the user is a member of.
    const assigneeIds = await user.getAssigneeIds();
    const getQuestsResult = await QuestService.findQuests({ assigneeIds });
    if (getQuestsResult.status === "success") {
      // Only the entries in progress and waiting for an answer are checked;
      // other entries of the same quests are left alone.
      waiting.push(
        ...getQuestsResult.data
          .filter(
            (quest) =>
              quest.status === QuestStatus.IN_PROGRESS && quest.textResponse
          )
          .map((quest) => ({ quest, userId: user.id ?? "" }))
      );
    }
  }
  if (!waiting.length) {
    return reply(
      "The PuzzleMaster is not expecting to hear from you at this time."
    );
  }
  for (const { quest, userId } of waiting) {
    const answered = await ChallengeService.answerChallenge(
      quest.name,
      quest.entryId,
      messageBody,
      { userId, via: "sms" }
    );
    if (answered.status === "success" && answered.data.outcome === "right") {
      notifyEntryFollowers("challengeAnswered", quest);
      return reply(answered.data.confirmation);
    }
  }
  return reply("Your response was incorrect.");
}

/** Who plays an entry, and how each can be sent the puzzle master's messages. */
export interface EntryRecipients {
  /** Every player of the entry. */
  playerIds: string[];
  /** Those whose phones get the puzzle master's messages as push notifications. */
  appPlayerIds: string[];
  /** The numbers to text, in international format. */
  phoneNumbers: string[];
}

/**
 * Finds how to reach a quest's entry's players: by push notification, those
 * with the app; by text message, those who accept texts and, unless the quest
 * says not to text them, those with the app too.
 * @param assignee the user or team playing the entry
 * @param textAppPlayers false to leave out players who have the app
 * @returns the players and how to reach them
 */
export async function recipientsOf(
  assignee: Pick<QuestService.QuestAssignee, "kind" | "id">,
  textAppPlayers: boolean
): Promise<ServiceResult<EntryRecipients>> {
  let userIds: readonly unknown[] = [assignee.id];
  if (assignee.kind === "team") {
    const team = await TeamModel.findById(assignee.id, { memberIds: 1 }).lean();
    if (!team) {
      return {
        status: "error",
        statusCode: 404,
        reason: "not-found",
        message: "The team this quest is assigned to no longer exists",
      };
    }
    userIds = team.memberIds;
  }
  const users = await UserModel.find(
    { _id: { $in: userIds } },
    { phone: 1, sms: 1 }
  ).lean();
  if (assignee.kind === "user" && !users.length) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: "The user this quest is assigned to no longer exists",
    };
  }
  const playerIds = users.map((user) => user._id.toString());
  const appPlayerIds = [
    ...new Set(
      (await SessionService.findPushTargets(playerIds, "message")).map(
        (target) => target.userId
      )
    ),
  ];
  const phoneNumbers = users.flatMap((user) =>
    user.phone &&
    user.sms &&
    (textAppPlayers || !appPlayerIds.includes(user._id.toString()))
      ? [user.phone]
      : []
  );
  return {
    status: "success",
    statusCode: 200,
    data: { playerIds, appPlayerIds, phoneNumbers },
  };
}

/**
 * Texts a message to each of the given phone numbers through Twilio, waiting
 * between messages to stay within carrier limits.
 * @param numbersToMessage the phone numbers to text
 * @param messageToSend the message
 * @returns a success result, or an error result with Twilio's message
 */
export async function sendOutgoingTextMessage(
  numbersToMessage: string[],
  messageToSend: string
): Promise<ServiceResult<undefined>> {
  const client = new Twilio.Twilio(
    config.PQ_TWILIO_ACCOUNT_SID,
    config.PQ_TWILIO_AUTH_TOKEN
  );
  for (const phoneNumber of numbersToMessage) {
    try {
      await client.messages.create({
        body: `From the PuzzleQuest Game ${messageToSend}\n\nReply 'STOP' to unsubscribe`,
        messagingServiceSid: config.PQ_TWILIO_MESSAGING_SERVICE_ID,
        to: phoneNumber,
      });
    } catch (err) {
      return {
        ...unexpectedErrorResult("sendOutgoingTextMessage", err),
        reason: "messaging-failed",
      };
    }
    // Regulatory throttling means that only one message can be sent every
    // four seconds for AT&T (on per second for other carriers), so we back
    // off sending to multiple numbers.
    await setTimeout(5000);
  }
  return { status: "success", statusCode: 200 };
}

/** What the puzzle master sends: a message, or a challenge kept with the quest. */
export type Outgoing =
  | {
      message: string;
      /** The answer to wait for and its confirmation, to set a challenge. */
      reply?: { expectedResponse: string; responseConfirmation: string };
    }
  | { challengeId: string };

/**
 * Works out what's sent: a challenge given in full is kept with the quest,
 * and one given by its ID is found there.
 * @param questName the quest
 * @param outgoing what to send
 * @returns the message's text, and the challenge it sets, if any
 */
async function prepare(
  questName: string,
  outgoing: Outgoing
): Promise<
  ServiceResult<{ text: string; challenge?: ChallengeService.QuestChallenge }>
> {
  if ("challengeId" in outgoing) {
    const found = await ChallengeService.findChallenge(
      questName,
      outgoing.challengeId
    );
    return found.status === "error"
      ? found
      : {
          status: "success",
          statusCode: 200,
          data: { text: found.data.message, challenge: found.data },
        };
  }
  if (!outgoing.reply) {
    return {
      status: "success",
      statusCode: 200,
      data: { text: outgoing.message },
    };
  }
  const kept = await ChallengeService.keepChallenge(questName, {
    message: outgoing.message,
    answer: outgoing.reply.expectedResponse,
    confirmation: outgoing.reply.responseConfirmation,
  });
  return kept.status === "error"
    ? kept
    : {
        status: "success",
        statusCode: 200,
        data: { text: outgoing.message, challenge: kept.data },
      };
}

/**
 * Tells those following a quest that something happened to one entry's
 * messages: only staff and its own players, since it's no one else's
 * business; everyone else is told only that the entry changed.
 * @param message which update
 * @param quest the quest, as seen through the entry
 */
export function notifyEntryFollowers(
  message: "messageSent" | "challengeAnswered",
  quest: Pick<QuestService.Quest, "name" | "entryId" | "assignee">
): void {
  WebSocketService.notifyQuestFollowers(
    { message, questName: quest.name, entryId: quest.entryId },
    [],
    // As in a race, whether or not this quest is one.
    { racing: true, assigneeId: quest.assignee.id }
  );
}

/**
 * Delivers a message to an entry: keeps it with the entry, where the app and
 * the quest console show it, tells those following the quest, and sends it
 * to the players' phones as a push notification.
 * @param quest the quest, as seen through the entry
 * @param text the message
 * @param challenge the challenge it sets, if any
 * @param recipients who plays the entry, and who has the app
 * @returns success, or why it couldn't be kept
 */
async function deliver(
  quest: QuestService.Quest,
  text: string,
  challenge: ChallengeService.QuestChallenge | undefined,
  recipients: EntryRecipients
): Promise<ServiceResult<undefined>> {
  const recorded = await ChallengeService.recordMessage(
    quest.name,
    quest.entryId,
    text,
    challenge
  );
  if (recorded.status === "error") {
    return recorded;
  }
  notifyEntryFollowers("messageSent", quest);
  // Not waited for: Apple's and Google's services never slow the console.
  void PushService.sendPush(recipients.appPlayerIds, {
    category: "message",
    questName: quest.name,
    title: quest.displayName || quest.name,
    body: text,
  });
  return recorded;
}

/**
 * Sends the puzzle master's message, or challenge, to every one of a quest's
 * entries in progress: in the app to players who have it, and by text to
 * those who accept texts (each number once), unless the quest says not to
 * text players who have the app.
 * @param questName the quest
 * @param outgoing what to send
 * @returns a success result, or an error result saying why it wasn't sent
 */
export async function sendQuestTextMessageToAll(
  questName: string,
  outgoing: Outgoing
): Promise<ServiceResult<undefined>> {
  const found = await QuestService.getQuestEntries(questName);
  if (found.status === "error") {
    return found;
  }
  const playing = found.data.filter(
    (entry) => entry.status === QuestStatus.IN_PROGRESS
  );
  if (!playing.length) {
    return {
      status: "error",
      statusCode: 400,
      reason: "wrong-state",
      message: `No one is playing quest ${questName} yet`,
    };
  }
  const reached: { quest: QuestService.Quest; recipients: EntryRecipients }[] =
    [];
  for (const quest of playing) {
    const recipients = await recipientsOf(quest.assignee, quest.textAppPlayers);
    if (recipients.status === "error") {
      return recipients;
    }
    reached.push({ quest, recipients: recipients.data });
  }
  if (!reached.some(({ recipients }) => reachable(recipients))) {
    return noRecipients();
  }
  const prepared = await prepare(questName, outgoing);
  if (prepared.status === "error") {
    return prepared;
  }
  for (const { quest, recipients } of reached) {
    const delivered = await deliver(
      quest,
      prepared.data.text,
      prepared.data.challenge,
      recipients
    );
    if (delivered.status === "error") {
      return delivered;
    }
  }
  const numbers = new Set(
    reached.flatMap(({ recipients }) => recipients.phoneNumbers)
  );
  return sendOutgoingTextMessage([...numbers], prepared.data.text);
}

/**
 * Sends the puzzle master's message, or challenge, to one of a quest's
 * entries, once it is in progress: in the app to players who have it, and by
 * text to those who accept texts, unless the quest says not to text players
 * who have the app.
 * @param questName the quest
 * @param entrant the user or team playing the entry
 * @param outgoing what to send
 * @returns a success result, or an error result saying why it wasn't sent
 */
export async function sendQuestTextMessage(
  questName: string,
  entrant: QuestService.EntrantRef,
  outgoing: Outgoing
): Promise<ServiceResult<undefined>> {
  const found = await QuestService.getQuestEntries(questName);
  if (found.status === "error") {
    return found;
  }
  const quest = found.data.find(
    ({ assignee }) =>
      assignee.kind === entrant.kind && assignee.name === entrant.name
  );
  if (!quest) {
    return {
      status: "error",
      statusCode: 404,
      reason: "not-found",
      message: `${entrant.kind} ${entrant.name} isn't playing quest ${questName}`,
    };
  }
  if (quest.status !== QuestStatus.IN_PROGRESS) {
    return {
      status: "error",
      statusCode: 400,
      reason: "wrong-state",
      message: `Quest ${quest.name} is not in progress`,
    };
  }
  const recipients = await recipientsOf(quest.assignee, quest.textAppPlayers);
  if (recipients.status === "error") {
    return recipients;
  }
  if (!reachable(recipients.data)) {
    return noRecipients();
  }
  const prepared = await prepare(questName, outgoing);
  if (prepared.status === "error") {
    return prepared;
  }
  const delivered = await deliver(
    quest,
    prepared.data.text,
    prepared.data.challenge,
    recipients.data
  );
  if (delivered.status === "error") {
    return delivered;
  }
  return recipients.data.phoneNumbers.length
    ? sendOutgoingTextMessage(recipients.data.phoneNumbers, prepared.data.text)
    : delivered;
}

/**
 * Says whether an entry's players can be sent a message at all.
 * @param recipients who plays the entry, and how to reach them
 * @returns true if someone has the app or accepts texts
 */
function reachable(recipients: EntryRecipients): boolean {
  return (
    recipients.appPlayerIds.length > 0 || recipients.phoneNumbers.length > 0
  );
}

/** The error for a message no one can be sent. */
function noRecipients(): ServiceResult<undefined> {
  return {
    status: "error",
    statusCode: 400,
    reason: "no-recipients",
    message: "No players with the app or accepting text messages found",
  };
}

/**
 * Answers the challenge a player's entry in a quest waits for, from the app
 * or the web. A right answer finishes it for the whole entry, and tells
 * those following the entry.
 * @param questName the quest
 * @param player the player: their ID, and the IDs they play as (their own,
 *  and their teams')
 * @param answer the answer, as given
 * @returns the confirmation to show the venue's staff, or why there's none
 */
export async function answerChallengeInApp(
  questName: string,
  player: { userId: string; assigneeIds: string[] },
  answer: string
): Promise<ServiceResult<{ confirmation: string; answeredAt: Date }>> {
  const found = await QuestService.findQuests({
    questName,
    assigneeIds: player.assigneeIds,
  });
  const quest = found.status === "success" ? found.data[0] : undefined;
  if (!quest) {
    // As for the puzzles: a quest that exists, but isn't theirs, is
    // forbidden.
    return (await QuestModel.exists({ name: questName }))
      ? {
          status: "error",
          statusCode: 403,
          reason: "forbidden",
          message: `You aren't playing quest ${questName}`,
        }
      : {
          status: "error",
          statusCode: 404,
          reason: "not-found",
          message: `No quest named ${questName}`,
        };
  }
  if (quest.status !== QuestStatus.IN_PROGRESS) {
    return {
      status: "error",
      statusCode: 400,
      reason: "wrong-state",
      message: `Quest ${questName} is not in progress`,
    };
  }
  const answered = await ChallengeService.answerChallenge(
    questName,
    quest.entryId,
    answer,
    { userId: player.userId, via: "app" }
  );
  if (answered.status === "error") {
    return answered;
  }
  switch (answered.data.outcome) {
    case "right":
      notifyEntryFollowers("challengeAnswered", quest);
      return {
        status: "success",
        statusCode: 200,
        data: {
          confirmation: answered.data.confirmation,
          answeredAt: answered.data.answeredAt,
        },
      };
    case "wrong":
      return {
        status: "error",
        statusCode: 400,
        reason: "wrong-answer",
        message: "That isn't the answer",
      };
    case "none":
      return {
        status: "error",
        statusCode: 400,
        reason: "wrong-state",
        message:
          "No challenge is waiting for an answer: none was sent, or it has been answered",
      };
  }
}
