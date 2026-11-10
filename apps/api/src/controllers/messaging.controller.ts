import type { Response } from "express";
import type {
  IncomingCallBody,
  IncomingTextBody,
} from "../schemas/messaging.schemas.js";
import * as QuestService from "../services/quest.service.js";
import * as MessagingService from "../services/messaging.service.js";

export async function receiveVoiceCall(
  req: { body: IncomingCallBody },
  res: Response
): Promise<void> {
  const voice = await MessagingService.respondToVoiceCall(req.body.From);
  if (voice.status === "error") {
    res.status(voice.statusCode).send(voice.message);
    return;
  }
  res.type("text/xml").send(voice.data.response);

  if (voice.data.questsToActivate) {
    for (const { questName, entryId } of voice.data.questsToActivate) {
      await QuestService.startQuest(questName, {}, { entryId });
    }
  }
}

export async function receiveTextMessage(
  req: { body: IncomingTextBody },
  res: Response
): Promise<void> {
  const text = await MessagingService.respondToTextMessage(
    req.body.From,
    req.body.Body
  );
  res.type("text/xml").send(text.data);
}
