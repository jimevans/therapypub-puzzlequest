import express from "express";
import * as MessagingController from "../controllers/messaging.controller.js";

const messagingApiRouter = express.Router();

messagingApiRouter.post(
  "/incoming/voice",
  MessagingController.receiveVoiceCall
)

export { messagingApiRouter as MessagingApiRouter };
