import { setTimeout } from "timers/promises";
import Twilio from "twilio";
import { config } from "../config.js";
import { QuestStatus } from "../models/quest.model.js";
import * as QuestService from "../services/quest.service.js";
import { TeamModel, UserModel } from "../models/user.model.js";
import * as UserService from "../services/user.service.js";
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
 * Builds the reply to an incoming text message, checking it against any reply
 * the sender's entries in quests in progress (their own, or their team's) are
 * expecting.
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
  const getUserResult = await UserService.getUsersByPhoneNumber(
    initiatingPhoneNumber
  );
  if (getUserResult.status === "error") {
    messageResponse.message(
      "From the PuzzleQuest Game\n\nYou are not a registered user of this service\n\nReply 'STOP' to unsubscribe"
    );
    return {
      status: "success",
      statusCode: 200,
      data: messageResponse.toString(),
    };
  }

  const questsToValidate: QuestEntryRef[] = [];
  const users = getUserResult.data;
  for (const user of users) {
    // Gets the entries of the user and any teams the user is a member of.
    const assigneeIds = await user.getAssigneeIds();
    const findOptions = { assigneeIds };
    const getQuestsResult = await QuestService.findQuests(findOptions);
    if (getQuestsResult.status === "success") {
      // Only the entries in progress and expecting an incoming text message
      // are checked; other entries of the same quests are left alone.
      const entries = getQuestsResult.data
        .filter(
          (quest) =>
            quest.status === QuestStatus.IN_PROGRESS && quest.textResponse
        )
        .map((quest) => ({ questName: quest.name, entryId: quest.entryId }));
      questsToValidate.push(...entries);
    }
  }
  let responseBody =
    "From the PuzzleQuest Game\n\nThe PuzzleMaster is not expecting to hear from you at this time.\n\nReply 'STOP' to unsubscribe";
  if (questsToValidate.length) {
    for (const { questName, entryId } of questsToValidate) {
      const validationResult = await QuestService.validateExpectedTextResponse(
        questName,
        entryId,
        messageBody
      );
      if (validationResult.status === "success") {
        responseBody = `From the PuzzleQuest Game\n\n${validationResult.data}\n\nReply 'STOP' to unsubscribe`;
        break;
      }
      if (validationResult.statusCode === 400) {
        responseBody =
          "From the PuzzleQuest Game\n\nYour response was incorrect.\n\nReply 'STOP' to unsubscribe";
      }
    }
  }
  messageResponse.message(responseBody);
  return {
    status: "success",
    statusCode: 200,
    data: messageResponse.toString(),
  };
}

/**
 * Records the reply one of a quest's entries expects by text message, and the
 * confirmation to send when it arrives. Does nothing if no reply is expected.
 * @param questName the name of the quest
 * @param entryId the ID of the entry
 * @param expectedIncomingMessage the expected reply, if any
 * @param confirmation the confirmation to send when the reply arrives
 * @returns a success result, or an error result
 */
export async function setupExpectedTextMessage(
  questName: string,
  entryId: string,
  expectedIncomingMessage: string | undefined,
  confirmation: string | undefined
): Promise<ServiceResult<undefined>> {
  if (expectedIncomingMessage) {
    if (!confirmation) {
      return {
        status: "error",
        statusCode: 400,
        message: `Expected response requires a response confirmation`,
      };
    }

    const setExpectationResult = await QuestService.setExpectedTextResponse(
      questName,
      entryId,
      expectedIncomingMessage,
      confirmation
    );
    if (setExpectationResult.status === "error") {
      return setExpectationResult;
    }
  }
  return { status: "success", statusCode: 200 };
}

/**
 * Gets the phone numbers to text for a quest's entry: the user's number, or
 * those of the team's members, for whoever accepts text messages.
 * @param assignee the user or team playing the entry
 * @returns the phone numbers to text, in international format
 */
export async function getPhoneNumbersToMessage(
  assignee: Pick<QuestService.QuestAssignee, "kind" | "id">
): Promise<ServiceResult<string[]>> {
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
  return {
    status: "success",
    statusCode: 200,
    data: users.flatMap((user) => (user.phone && user.sms ? [user.phone] : [])),
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

/**
 * Texts a message to the players of one of a quest's entries, once it is in
 * progress, who accept text messages, and optionally sets the reply the entry
 * then waits for.
 * @param questName the quest
 * @param entrant the user or team playing the entry
 * @param message the message
 * @param reply the reply to wait for, and the confirmation to send back
 *  when it arrives; omit to wait for none
 * @returns a success result, or an error result saying why it wasn't sent
 */
export async function sendQuestTextMessage(
  questName: string,
  entrant: QuestService.EntrantRef,
  message: string,
  reply?: { expectedResponse: string; responseConfirmation: string }
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
  const numbers = await getPhoneNumbersToMessage(quest.assignee);
  if (numbers.status === "error") {
    return numbers;
  }
  if (!numbers.data.length) {
    return {
      status: "error",
      statusCode: 400,
      reason: "no-recipients",
      message: "No users accepting text messages found for quest",
    };
  }
  if (reply) {
    const expectation = await setupExpectedTextMessage(
      quest.name,
      quest.entryId,
      reply.expectedResponse,
      reply.responseConfirmation
    );
    if (expectation.status === "error") {
      return expectation;
    }
  }
  return sendOutgoingTextMessage(numbers.data, message);
}
