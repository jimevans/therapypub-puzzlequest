import express from "express";
import { validate } from "../middleware/validate.js";
import {
  incomingCallBody,
  incomingTextBody,
} from "../schemas/messaging.schemas.js";
import * as MessagingController from "../controllers/messaging.controller.js";
import { requireTwilioSignature } from "../middleware/twilioSignature.js";

// Twilio's webhooks at their original URLs, kept until the Twilio console
// points at the v1 ones (/api/v1/webhooks/twilio/voice and
// /api/v1/webhooks/twilio/messages).
const messagingApiRouter = express.Router();

messagingApiRouter.post(
  "/incoming/voice",
  requireTwilioSignature,
  validate({ body: incomingCallBody }),
  MessagingController.receiveVoiceCall
);
messagingApiRouter.post(
  "/incoming/text",
  requireTwilioSignature,
  validate({ body: incomingTextBody }),
  MessagingController.receiveTextMessage
);
export { messagingApiRouter as MessagingApiRouter };
