// Twilio's webhooks, for calls and text messages to the quest's number.
// Twilio signs each request; unsigned requests are refused with a plain 403,
// which is all Twilio needs.
import { z } from "zod";
import * as MessagingController from "../../controllers/messaging.controller.js";
import { requireTwilioSignature } from "../../middleware/twilioSignature.js";
import {
  incomingCallBody,
  incomingTextBody,
} from "../../schemas/messaging.schemas.js";
import { defineRoute } from "./route.js";

/** A TwiML document, telling Twilio what to do. */
const twiml = {
  description: "TwiML for Twilio.",
  body: z.string(),
  mediaType: "text/xml",
};

export const twilioRoutes = [
  defineRoute({
    method: "post",
    path: "/twilio/voice",
    operationId: "receiveVoiceCall",
    summary: "Receive a phone call (Twilio)",
    description:
      "Twilio's webhook for a call to the quest's number. A caller with quests waiting to start hears that they have begun, and they start; anyone else hears that there are none. Only Twilio may call it: requests need its X-Twilio-Signature.",
    tags: ["Twilio"],
    access: "public",
    before: [requireTwilioSignature],
    request: {
      body: incomingCallBody,
      bodyMediaType: "application/x-www-form-urlencoded",
    },
    responses: { 200: twiml },
    handle(req, res) {
      return MessagingController.receiveVoiceCall(req, res);
    },
  }),
  defineRoute({
    method: "post",
    path: "/twilio/messages",
    operationId: "receiveTextMessage",
    summary: "Receive a text message (Twilio)",
    description:
      "Twilio's webhook for a text message to the quest's number. A reply a quest is waiting for is confirmed. Only Twilio may call it: requests need its X-Twilio-Signature.",
    tags: ["Twilio"],
    access: "public",
    before: [requireTwilioSignature],
    request: {
      body: incomingTextBody,
      bodyMediaType: "application/x-www-form-urlencoded",
    },
    responses: { 200: twiml },
    handle(req, res) {
      return MessagingController.receiveTextMessage(req, res);
    },
  }),
];
