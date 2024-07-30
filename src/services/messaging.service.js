import { setTimeout } from "timers/promises";
import Twilio from "twilio";
import { config } from "../config.js";
import * as QuestService from "../services/quest.service.js";
import * as TeamService from "../services/team.service.js";
import * as UserService from "../services/user.service.js";

export async function respondToVoiceCall(initiatingPhoneNumber) {
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

  const fromNumber = initiatingPhoneNumber.replace(/[^\d]/g, "").substring(1);
  const getUserResponse = await UserService.getUsersByPhoneNumber(fromNumber);
  if (getUserResponse.status === "error") {
    // If there are no users with the incoming phone number, reject the call.
    voiceResponse.reject({ reason: "rejected" });
    return {
      status: "success",
      statusCode: 200,
      data: { response: voiceResponse.toString() },
    };
  }
  const questNames = [];
  for (const user of getUserResponse.data) {
    // Gets all quests for user and any teams the user is a member of.
    const userContexts = await user.getAllUserContexts();
    const findOptions = { userNames: userContexts };
    const getQuestsResponse = await QuestService.findQuests(findOptions);
    if (getQuestsResponse.status === "success") {
      // Filter the quests so only those awaiting activation are selected.
      const userQuestNames = getQuestsResponse.data
        .filter((quest) => quest.status === 0)
        .map((quest) => quest.name);
      questNames.push(...userQuestNames);
    }
  }
  const responseMessage = questNames.length
    ? "Congratulations! You have reached the puzzle master. Your quest starts now. Save this number in your contacts, and good luck"
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

export async function respondToTextMessage(
  initiatingPhoneNumber,
  incomingMessage
) {
  const fromNumber = initiatingPhoneNumber.replace(/[^\d]/g, "").substring(1);
  const messageBody = incomingMessage.trim();
  const messageResponse = new Twilio.twiml.MessagingResponse();
  const getUserResult = await UserService.getUsersByPhoneNumber(fromNumber);
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

  const questsToValidate = [];
  const users = getUserResult.data;
  for (const user of users) {
    // Gets all quests for user and any teams the user is a member of.
    const userContexts = await user.getAllUserContexts();
    const findOptions = { userNames: userContexts };
    const getQuestsResult = await QuestService.findQuests(findOptions);
    if (getQuestsResult.status === "success") {
      // Filter the quests so only those in progress and expecting an incoming
      // text message are selected.
      const questNames = getQuestsResult.data
        .filter((quest) => quest.status === 1 && quest.textResponse)
        .map((quest) => quest.name);
      questsToValidate.push(...questNames);
    }
  }
  let responseBody =
    "From the PuzzleQuest Game\n\nThe PuzzleMaster is not expecting to hear from you at this time.\n\nReply 'STOP' to unsubscribe";
  if (questsToValidate.length) {
    for (const questName of questsToValidate) {
      const validationResult = await QuestService.validateExpectedTextResponse(
        questName,
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

export async function setupExpectedTextMessage(
  questName,
  expectedIncomingMessage,
  confirmation
) {
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
      expectedIncomingMessage,
      confirmation
    );
    if (setExpectationResult.status === "error") {
      return setExpectationResult;
    }
  }
  return { status: "success", statusCode: 200 };
}

export async function getPhoneNumbersToMessage(questUser) {
  // Quest user could be a user or a team
  const numbersToMessage = [];
  const getUserResponse = await UserService.getUserByUserName(questUser);
  if (getUserResponse.status === "error") {
    const getTeamResponse = await TeamService.getTeamByTeamName(questUser);
    if (getTeamResponse.status === "error") {
      return {
        status: "error",
        statusCode: 404,
        message: `Could not find user or team named ${questUser}`,
      };
    } else {
      for (const memberName of getTeamResponse.data.memberNames) {
        const getTeamMemberResponse = await UserService.getUserByUserName(
          memberName
        );
        if (getTeamMemberResponse.status === "error") {
          return {
            status: "error",
            statusCode: 404,
            message: `User ${memberName} is not a member of team ${questUser}`,
          };
        }
        const user = getTeamMemberResponse.data;
        if (user.phone && user.allowSmsMessages) {
          numbersToMessage.push(`+1${user.phone}`);
        }
      }
    }
  } else {
    if (getUserResponse.data.phone && getUserResponse.data.allowSmsMessages) {
      numbersToMessage.push(`+1${getUserResponse.data.phone}`);
    }
  }
  return { status: "success", statusCode: 200, data: numbersToMessage };
}

export async function sendOutgoingTextMessage(numbersToMessage, messageToSend) {
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
      return { status: "error", statusCode: 500, message: err.message };
    }
    // Regulatory throttling means that only one message can be sent every
    // four seconds for AT&T (on per second for other carriers), so we back
    // off sending to multiple numbers.
    await setTimeout(5000);
  }
  return { status: "success", statusCode: 200 };
}
