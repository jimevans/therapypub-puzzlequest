import { setTimeout } from 'timers/promises'
import Twilio from "twilio";
import { config } from "../config.js";
import { QuestStatus } from "../models/quest.model.js";
import { AuthorizationLevel } from '../models/user.model.js';
import * as QuestService from "../services/quest.service.js";
import * as TeamService from "../services/team.service.js";
import * as UserService from "../services/user.service.js";

export async function receiveVoiceCall(req, res) {
  const fromNumber = req.body.From.replace(/[^\d]/g, "").substring(1);
  const getUserResponse = await UserService.getUsersByPhoneNumber(fromNumber);
  if (getUserResponse.status === "error") {
    // If there are no users with the incoming phone number, reject the call.
    const rejection = new Twilio.twiml.VoiceResponse();
    voiceResponse.reject({ reason: "rejected" });
    res.type("text/xml");
    res.send(rejection.toString());
    return;
  }
  const voiceResponse = new Twilio.twiml.VoiceResponse();
  const questNames = []
  for (const user of getUserResponse.data) {
    // Gets all quests for user and any teams the user is a member of.
    const getQuestsResponse = await QuestService.getQuests(user.userName);
    if (getQuestsResponse.status === "success") {
      // Filter the quests so only those awaiting activation are selected.
      const quests = getQuestsResponse.data.filter((quest) => quest.status === 0);
      for (const quest of quests) {
        questNames.push(quest.name);
      }
    }
  }
  const responseMessage = questNames.length
    ? "Congratulations! You have reached the puzzle master. Your quest starts now. Save this number in your contacts, and good luck"
    : "The puzzle master says you have no quests waiting to start.";
  voiceResponse.say(
    {
      voice: "Polly.Emma",
      language: "en-GB"
    },
    responseMessage
  );
  res.type("text/xml");
  res.send(voiceResponse.toString());
  // Activate all quests for this user that are awaiting activation.
  for (const questName of questNames) {
    await QuestService.startQuest(questName);
  }
}

export async function receiveTextMessage(req, res) {
  const fromNumber = req.body.From.replace(/[^\d]/g, "").substring(1);
  const messageBody = req.body.Body.trim();
  const messageResponse = new Twilio.twiml.MessagingResponse();
  const getUserResult = await UserService.getUsersByPhoneNumber(fromNumber);
  if (getUserResult.status === "error") {
    messageResponse.message("From the PuzzleQuest Game\n\nYou are not a registered user of this service\n\nReply 'STOP' to unsubscribe");
    res.type("text/xml").send(messageResponse.toString());
    return;
  }
  const questsToValidate = [];
  const users = getUserResult.data;
  for (const user of users) {
    // Gets all quests for user and any teams the user is a member of.
    const getQuestsResult = await QuestService.getQuests(user.userName);
    if (getQuestsResult.status === "success") {
      // Filter the quests so only those awaiting activation are selected.
      const quests = getQuestsResult.data.filter((quest) =>
        quest.status === 1 && quest.textResponse);
      quests.forEach((quest) => questsToValidate.push(quest.name));
    }
  }
  let responseBody = "From the PuzzleQuest Game\n\nThe PuzzleMaster is not expecting to hear from you at this time.\n\nReply 'STOP' to unsubscribe";
  if (questsToValidate.length) {
    for (const questName of questsToValidate) {
      const validationResult = await QuestService.validateExpectedTextResponse(questName, messageBody);
      if (validationResult.status === "success") {
        responseBody = `From the PuzzleQuest Game\n\n${validationResult.data}\n\nReply 'STOP' to unsubscribe`;
        break;
      }
      if (validationResult.statusCode === 400) {
        responseBody = "From the PuzzleQuest Game\n\nYour response was incorrect.\n\nReply 'STOP' to unsubscribe";
      }
    }
  }
  messageResponse.message(responseBody);
  res.type("text/xml").send(messageResponse.toString());
}

export async function sendTextMessage(req, res) {
  if (req.user === null) {
    res.status(401).send(
      JSON.stringify({
        status: "error",
        message: `User must be logged in to send messages`,
      })
    );
    return;
  }
  if (!UserService.isUserAdmin(req.user)) {
    res.status(403).send(
      JSON.stringify({
        status: "error",
        message: `User ${req.user.userName} not authorized to send messages`,
      })
    );
    return;
  }
  if (!req.body) {
    res.status(400).send(JSON.stringify({
      status: "error",
      message: "No request body"
    }));
    return;
  }
  if (!("questName" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({
        status: "error",
        message: "No quest name in request body"
      }));
    return;
  }
  if (!("message" in req.body)) {
    res
      .status(400)
      .send(JSON.stringify({
        status: "error",
        message: "No message in request body"
      }));
    return;
  }

  const getQuestResponse = await QuestService.getQuest(req.body.questName);
  if (getQuestResponse.status === "error") {
    res
      .status(getQuestResponse.statusCode)
      .send(JSON.stringify({
        status: "error",
        message: getQuestResponse.message
      }));
    return;
  }
  const quest = getQuestResponse.data;
  if (quest.status !== QuestStatus.IN_PROGRESS) {
    res
    .status(400)
    .send(JSON.stringify({
      status: "error",
      message: `Quest ${quest.name} is not in progress`
    }));
    return;
  }

  if (req.body.expectedResponse) {
    if (!req.body.responseConfirmation) {
      res
        .status(400)
        .send(JSON.stringify({
          status: "error",
          message: `Expected response requires a response confirmation`
        }));
      return;
    }

    const setExpectationResult = await QuestService.setExpectedTextResponse(
      quest.name,
      req.body.expectedResponse,
      req.body.responseConfirmation);
    if (setExpectationResult.status === "error") {
      res
        .status(setExpectationResult.statusCode)
        .send(JSON.stringify({
          status: "error",
          message: setExpectationResult.message
        }));
      return;
    }
  }

  const numbersToMessageResponse = await getPhoneNumbersToMessage(quest.userName);
  if (numbersToMessageResponse.status === "error") {
    res.status(numbersToMessageResponse.statusCode).send(JSON.stringify({
      status: "error",
      message: numbersToMessageResponse.message
    }))
    return;
  }

  const numbersToMessage = numbersToMessageResponse.data;
  if (!numbersToMessage.length) {
    // Early return if no numbers to message found.
    res.status(400).send(JSON.stringify({
      status: "error",
      message: "No users accepting text messages found for quest"
    }));
    return;
  }

  const client = new Twilio.Twilio(
    config.PQ_TWILIO_ACCOUNT_SID,
    config.PQ_TWILIO_AUTH_TOKEN);
  for (const phoneNumber of numbersToMessage) {
    try {
      await client.messages.create({
        body: `From the PuzzleQuest Game ${req.body.message}\n\nReply 'STOP' to unsubscribe`,
        messagingServiceSid: config.PQ_TWILIO_MESSAGING_SERVICE_ID,
        to: phoneNumber
      });
    } catch (err) {
      res.status(500).send(JSON.stringify({ status: "error", message: err.message }));
      return;
    }
    // Regulatory throttling means that only one message can be sent every
    // four seconds for AT&T (on per second for other carriers), so we back
    // off sending to multiple numbers.
    await setTimeout(5000);
  }
  res.status(200).send(JSON.stringify({
    status: "success"
  }));
}

async function getPhoneNumbersToMessage(questUser) {
  // Quest user could be a user or a team
  const numbersToMessage = [];
  const getUserResponse = await UserService.getUserByUserName(questUser);
  if (getUserResponse.status === "error") {
    const getTeamResponse = await TeamService.getTeamByTeamName(questUser);
    if (getTeamResponse.status === "error") {
      res.status(404).send(JSON.stringify({
        status: "error",
        message: `Could not find user or team named ${questUser}`
      }));
      return;
    } else {
      for (const memberName of getTeamResponse.data.memberNames) {
        const getTeamMemberResponse = await UserService.getUserByUserName(memberName);
        if (getTeamMemberResponse.status === "error") {
          res.status(404).send(JSON.stringify({
            status: "error",
            message: `User ${memberName} is not a member of team ${questUser}`
          }));
          return;
        }
        if (getTeamMemberResponse.data.phone && getTeamMemberResponse.data.sms) {
          numbersToMessage.push(`+1${getTeamMemberResponse.data.phone}`);
        }
      }
    }
  } else {
    if (getUserResponse.data.phone && getUserResponse.data.sms) {
      numbersToMessage.push(`+1${getUserResponse.data.phone}`);
    }
  }
  return { status: "success", statusCode: 200, data: numbersToMessage };
}
