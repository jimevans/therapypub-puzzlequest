// What a push notification carries, and the senders that deliver one to a
// phone through Apple's or Google's service.
import type { PushNotification } from "../schemas/pushNotifications.js";
import type { PushTarget } from "../services/session.service.js";

export type { PushNotification };

/**
 * What became of a notification: delivered to the service, refused because
 * the token no longer reaches the app (so it should be forgotten), or not
 * sent for another reason, which is logged.
 */
export type SendOutcome = "sent" | "gone" | "failed";

/** Delivers notifications to one platform's phones. */
export interface PushSender {
  /**
   * Sends a notification to a phone. Never throws: failures are an outcome.
   * @param target the phone
   * @param notification the notification
   * @returns what became of it
   */
  send(
    target: PushTarget,
    notification: PushNotification
  ): Promise<SendOutcome>;
  /** Closes any connection the sender keeps open. */
  close(): void;
}
