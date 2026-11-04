// Webhooks: callbacks from outside services, not routes for the site's own
// clients. They are left out of the API's description, since only the
// service that calls each one uses it, and each checks that the request
// came from that service.
//
// Twilio's, for calls and text messages to the quest's number, are at
// /webhooks/twilio/voice and /webhooks/twilio/messages. Twilio signs each
// request; anything else is refused with a plain 403 (see
// requireTwilioSignature).
import * as MessagingController from "../../controllers/messaging.controller.js";
import { requireTwilioSignature } from "../../middleware/twilioSignature.js";
import {
  incomingCallBody,
  incomingTextBody,
} from "../../schemas/messaging.schemas.js";
import { type AnyRoute, defineRoute } from "./route.js";

/**
 * Defines Twilio's webhooks under a path.
 * @param base the path the webhooks are under
 * @returns the routes
 */
function twilioWebhooks(base: string): AnyRoute[] {
  return [
    defineRoute({
      method: "post",
      path: `${base}/voice`,
      operationId: `receiveVoiceCall${base}`,
      summary: "Receive a phone call (Twilio)",
      description:
        "A caller with quests waiting to start hears that they have begun, and they start; anyone else hears that there are none.",
      tags: ["Webhooks"],
      documented: false,
      access: "public",
      before: [requireTwilioSignature],
      request: {
        body: incomingCallBody,
        bodyMediaType: "application/x-www-form-urlencoded",
      },
      responses: { 200: { description: "TwiML for Twilio." } },
      handle(req, res) {
        return MessagingController.receiveVoiceCall(req, res);
      },
    }),
    defineRoute({
      method: "post",
      path: `${base}/messages`,
      operationId: `receiveTextMessage${base}`,
      summary: "Receive a text message (Twilio)",
      description: "A reply a quest is waiting for is confirmed.",
      tags: ["Webhooks"],
      documented: false,
      access: "public",
      before: [requireTwilioSignature],
      request: {
        body: incomingTextBody,
        bodyMediaType: "application/x-www-form-urlencoded",
      },
      responses: { 200: { description: "TwiML for Twilio." } },
      handle(req, res) {
        return MessagingController.receiveTextMessage(req, res);
      },
    }),
  ];
}

export const webhookRoutes = [
  ...twilioWebhooks("/webhooks/twilio"),
  // Where Twilio's webhooks were first in v1, until the Twilio console
  // points at the ones above.
  ...twilioWebhooks("/twilio"),
];
