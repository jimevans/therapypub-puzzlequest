import Twilio from "twilio";
import { config } from "../config.js";
import * as UserService from "../services/user.service.js";
import * as QuestService from "../services/quest.service.js";

export async function receiveVoiceCall(req, res) {
  const voiceResponse = new Twilio.twiml.VoiceResponse();
  voiceResponse.say(
    {
      voice: "Polly.Emma",
      language: "en-GB"
    },
    "Congratulations! You have reached the puzzle master. Your quest starts now. Save this number in your contacts, and good luck"
  );
  res.type("text/xml");
  res.send(voiceResponse.toString());
  const fromNumber = req.body.From.replace(/[^\d]/g, "").substring(1);
  const getUserResponse = await UserService.getUsersByPhoneNumber(fromNumber);
  if (getUserResponse.status === "success") {
    getUserResponse.data.forEach(async (user) => {
      // Gets all quests for user and any teams the user is a member of.
      const getQuestsResponse = await QuestService.getQuests(user.userName);
      if (getQuestsResponse.status === "success") {
        getQuestsResponse.data
          .filter((quest) => quest.status === 0)
          .forEach(async (quest) => {
            await QuestService.startQuest(quest.name);
          }
        );
      }
    });
  }
}
