import express from "express";
import { validate } from "../middleware/validate.js";
import {
  incomingCallBody,
  incomingTextBody,
  sendTextBody,
} from "../schemas/messaging.schemas.js";
import { requireAdmin } from "../middleware/authorization.js";
import * as MessagingController from "../controllers/messaging.controller.js";
import { authenticateSession } from "../middleware/sessionAuthentication.js";
import { requireTwilioSignature } from "../middleware/twilioSignature.js";

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
messagingApiRouter.post(
  "/outgoing/text",
  authenticateSession,
  requireAdmin,
  validate({ body: sendTextBody }),
  MessagingController.sendTextMessage
);

export { messagingApiRouter as MessagingApiRouter };
