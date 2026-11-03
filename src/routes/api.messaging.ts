import express from "express";
import * as MessagingController from "../controllers/messaging.controller.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";
import { requireTwilioSignature } from "../middleware/twilioSignature.js";

const messagingApiRouter = express.Router();

messagingApiRouter.post(
  "/incoming/voice",
  requireTwilioSignature,
  MessagingController.receiveVoiceCall
);
messagingApiRouter.post(
  "/incoming/text",
  requireTwilioSignature,
  MessagingController.receiveTextMessage
);
messagingApiRouter.post(
  "/outgoing/text",
  TokenAuthenticator.tokenAuthenticate,
  MessagingController.sendTextMessage
);

export { messagingApiRouter as MessagingApiRouter };
