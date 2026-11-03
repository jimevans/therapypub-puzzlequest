import type { Response } from "express";
import type { BodyRequest } from "../types.js";
import type {
  IncomingCallBody,
  IncomingTextBody,
  SendTextBody,
} from "../schemas/messaging.schemas.js";
import { QuestStatus } from "../models/quest.model.js";
import * as QuestService from "../services/quest.service.js";
import * as UserService from "../services/user.service.js";
import * as MessagingService from "../services/messaging.service.js";

export async function receiveVoiceCall(
  req: BodyRequest<IncomingCallBody>,
  res: Response
): Promise<void> {
  const voice = await MessagingService.respondToVoiceCall(req.body.From);
  if (voice.status === "error") {
    res.status(voice.statusCode).send(voice.message);
    return;
  }
  res.type("text/xml").send(voice.data.response);

  if (voice.data.questsToActivate) {
    for (const questName of voice.data.questsToActivate) {
      await QuestService.startQuest(questName);
    }
  }
}

export async function receiveTextMessage(
  req: BodyRequest<IncomingTextBody>,
  res: Response
): Promise<void> {
  const text = await MessagingService.respondToTextMessage(
    req.body.From,
    req.body.Body
  );
  res.type("text/xml").send(text.data);
}

export async function sendTextMessage(
  req: BodyRequest<SendTextBody>,
  res: Response
): Promise<void> {
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
    res.status(400).send(
      JSON.stringify({
        status: "error",
        message: "No users accepting text messages found for quest",
      })
    );
    return;
  }

  const sendMessage = await MessagingService.sendOutgoingTextMessage(
    numbersToMessage,
    req.body.message
  );
  if (sendMessage.status === "error") {
    res.status(sendMessage.statusCode).send(
      JSON.stringify({
        status: "error",
        message: sendMessage.message,
      })
    );
    return;
  }
  res.status(200).send(
    JSON.stringify({
      status: "success",
    })
  );
}
