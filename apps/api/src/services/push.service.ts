// Sends push notifications to players' phones: those registered with their
// signed-in sessions (see session.service.ts), through Apple's service for
// iPhones and Firebase for Android phones. Each platform sends only when its
// settings are on the host; without them, as in development and tests,
// nothing is sent. Sending never fails the action that caused it.
import { config } from "../config.js";
import { logger } from "../logger.js";
import { createApnsSender } from "../push/apns.js";
import { createFcmSender } from "../push/fcm.js";
import type { PushNotification, PushSender } from "../push/types.js";
import * as SessionService from "./session.service.js";

/** The senders, by platform; a platform without one sends nothing. */
export type PushSenders = Partial<
  Record<SessionService.PushTarget["platform"], PushSender>
>;

/**
 * Creates the senders the host's settings allow.
 * @returns the senders
 */
function sendersFromConfig(): PushSenders {
  const senders: PushSenders = {};
  if (
    config.PQ_APNS_KEY_FILE &&
    config.PQ_APNS_KEY_ID &&
    config.PQ_APNS_TEAM_ID &&
    config.PQ_APNS_BUNDLE_ID
  ) {
    senders.ios = createApnsSender({
      key: config.PQ_APNS_KEY_FILE.key,
      keyId: config.PQ_APNS_KEY_ID,
      teamId: config.PQ_APNS_TEAM_ID,
      bundleId: config.PQ_APNS_BUNDLE_ID,
    });
  }
  if (config.PQ_FCM_SERVICE_ACCOUNT_FILE) {
    senders.android = createFcmSender({
      serviceAccount: config.PQ_FCM_SERVICE_ACCOUNT_FILE.account,
    });
  }
  return senders;
}

let senders: PushSenders | undefined;

/**
 * Replaces the senders, as tests do with fakes.
 * @param replacement the senders to use; undefined to go back to the
 *  host's settings
 */
export function setPushSenders(replacement: PushSenders | undefined): void {
  closePushSenders();
  senders = replacement;
}

/** Closes the senders' connections, as the server does when stopping. */
export function closePushSenders(): void {
  for (const sender of Object.values(senders ?? {})) {
    sender.close();
  }
  senders = undefined;
}

/**
 * Sends a notification to the phones of the given users that want its
 * kind. Tokens Apple or Google say are gone are forgotten.
 * @param userIds the users
 * @param notification the notification
 * @returns how many phones it was sent to
 */
export async function sendPush(
  userIds: readonly string[],
  notification: PushNotification
): Promise<number> {
  senders ??= sendersFromConfig();
  const active = senders;
  if (!userIds.length || !Object.keys(active).length) {
    return 0;
  }
  try {
    const targets = (
      await SessionService.findPushTargets(userIds, notification.category)
    ).filter((target) => active[target.platform]);
    const outcomes = await Promise.all(
      targets.map(async (target) => {
        const outcome = await active[target.platform]!.send(
          target,
          notification
        );
        if (outcome === "gone") {
          await SessionService.forgetPushToken(target.token);
        }
        return outcome;
      })
    );
    return outcomes.filter((outcome) => outcome === "sent").length;
  } catch (err) {
    logger.error({ err }, "Push notifications weren't sent");
    return 0;
  }
}
