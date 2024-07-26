import { QuestStatus } from "../models/quest.model.js";
import * as QuestService from "../services/quest.service.js";
import * as UserService from "../services/user.service.js";
import * as MessagingService from "../services/messaging.service.js";
import * as RequestValidationService from "../services/requestValidation.service.js";

export async function receiveVoiceCall(req, res) {
  const voice = await MessagingService.respondToVoiceCall(req.body.From);
  res.type("text/xml").send(voice.data.response);

  if (voice.data.questsToActivate) {
    for (const questName of voice.data.questsToActivate) {
      await QuestService.startQuest(questName);
    }
  }
}

export async function receiveTextMessage(req, res) {
  const text = await MessagingService.respondToTextMessage(
    req.body.From,
    req.body.Body
  );
  res.type("text/xml").send(text.data);
}

export async function sendTextMessage(req, res) {
  const validation = RequestValidationService.validateRequest(
    {
      requiresUser: true,
      requiresAdmin: true,
      requiresBody: true,
      requiredBodyProperties: ["questName", "message"],
    },
    req
  );
  if (validation.status === "error") {
    res.status(validation.statusCode).send(
      JSON.stringify({
        status: "error",
        message: validation.message,
      })
    );
    return;
  }
  const loggedInUser = UserService.getLoggedInUser(req.user);
  const getQuestResponse = await QuestService.getQuestByQuestName(
    req.body.questName,
    loggedInUser
  );
  if (getQuestResponse.status === "error") {
    res.status(getQuestResponse.statusCode).send(
      JSON.stringify({
        status: "error",
        message: getQuestResponse.message,
      })
    );
    return;
  }
  const quest = getQuestResponse.data;
  if (quest.status !== QuestStatus.IN_PROGRESS) {
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: `Quest ${quest.name} is not in progress`,
      })
    );
    return;
  }

  const setupReply = await MessagingService.setupExpectedTextMessage(
    quest.name,
    req.body.expectedResponse,
    req.body.responseConfirmation
  );
  if (setupReply.status === "error") {
    res.status(setupReply.statusCode).send(
      JSON.stringify({
        status: "error",
        message: setupReply.message,
      })
    );
    return;
  }

  const numbersToMessageResponse =
    await MessagingService.getPhoneNumbersToMessage(quest.userName);
  if (numbersToMessageResponse.status === "error") {
    res.status(numbersToMessageResponse.statusCode).send(
      JSON.stringify({
        status: "error",
        message: numbersToMessageResponse.message,
      })
    );
    return;
  }

  const numbersToMessage = numbersToMessageResponse.data;
  if (!numbersToMessage.length) {
    // Early return if no numbers to message found.
    res.status(400).send(JSON.stringify({
      status: "error",
      message: "No users accepting text messages found for quest",
    }));
    return;
  }

  const sendMessage = await MessagingService.sendOutgoingTextMessage(
    numbersToMessage,
    req.body.message
  );
  if (sendMessage.status === "error") {
    res.status(sendMessage.statusCode).send(JSON.stringify({
      status: "error",
      message: sendMessage.message
    }));
    return;
  }
  res.status(200).send(
    JSON.stringify({
      status: "success",
    })
  );
}
