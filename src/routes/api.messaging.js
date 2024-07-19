import express from "express";
import * as MessagingController from "../controllers/messaging.controller.js";
import * as TokenAuthenticator from "../middleware/tokenAuthentication.js";

const messagingApiRouter = express.Router();

messagingApiRouter.post(
  "/incoming/voice",
  MessagingController.receiveVoiceCall
);
messagingApiRouter.post(
  "/incoming/text",
  MessagingController.receiveTextMessage
);
messagingApiRouter.post(
  "/outgoing/text",
  TokenAuthenticator.tokenAuthenticate,
  MessagingController.sendTextMessage
);

export { messagingApiRouter as MessagingApiRouter };
