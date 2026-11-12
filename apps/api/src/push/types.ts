// What a push notification carries, and the senders that deliver one to a
// phone through Apple's or Google's service.
import type { PushTarget } from "../services/session.service.js";

/** A push notification, as the apps receive it. */
export interface PushNotification {
  /** The kind of notification, such as questStarted. */
  category: string;
  /** The quest it's about. */
  questName: string;
  /** The puzzle it's about, if any. */
  puzzleName?: string;
  /** What the notification shows, in English. */
  title: string;
  body: string;
}

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
