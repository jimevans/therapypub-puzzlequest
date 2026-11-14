// Sends push notifications to players' phones: those registered with their
// signed-in sessions (see session.service.ts), through Apple's service for
// iPhones and Firebase for Android phones. Each platform sends only when its
// settings are on the host; without them, as in development and tests,
// nothing is sent. Sending never fails the action that caused it.
import { config } from "../config.js";
import { log, logger } from "../logger.js";
import { createApnsSender } from "../push/apns.js";
import { createFcmSender } from "../push/fcm.js";
import type { PushSender } from "../push/types.js";
import {
  type PushNotification,
  pushNotificationSchema,
} from "../schemas/pushNotifications.js";
import * as SessionService from "./session.service.js";

/** The senders, by platform; a platform without one sends nothing. */
export type PushSenders = Partial<
  Record<SessionService.PushTarget["platform"], PushSender>
>;

/**
 * Says which platforms the host's settings let the server send to, for the
 * log when it starts, since a platform without them sends nothing, quietly;
 * and whether Apple's sandbox has a key of its own.
 * @returns whether it sends to iPhones and to Android phones, and whether
 *  the sandbox's key is its own
 */
export function pushPlatforms(): {
  ios: boolean;
  iosSandboxKey: boolean;
  android: boolean;
} {
  return {
    ios: Boolean(config.PQ_APNS_KEY_FILE),
    iosSandboxKey: Boolean(config.PQ_APNS_SANDBOX_KEY_FILE),
    android: Boolean(config.PQ_FCM_SERVICE_ACCOUNT_FILE),
  };
}

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
      sandbox:
        config.PQ_APNS_SANDBOX_KEY_FILE && config.PQ_APNS_SANDBOX_KEY_ID
          ? {
              key: config.PQ_APNS_SANDBOX_KEY_FILE.key,
              keyId: config.PQ_APNS_SANDBOX_KEY_ID,
            }
          : undefined,
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
 * kind, after checking it against what the apps expect. Tokens Apple or
 * Google say are gone are forgotten.
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
    // A notification the apps' contract doesn't allow is a bug; it's logged.
    pushNotificationSchema.parse(notification);
    const targets = (
      await SessionService.findPushTargets(userIds, notification.category)
    ).filter((target) => active[target.platform]);
    if (!targets.length) {
      log().info(
        { category: notification.category, players: userIds.length },
        "push notifications: no phones to send them to"
      );
      return 0;
    }
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
    const count = (kind: string) =>
      outcomes.filter((outcome) => outcome === kind).length;
    // Which of Apple's services the phones are on tells a build from Xcode
    // (development) from one from the App Store (production).
    log().info(
      {
        category: notification.category,
        phones: targets.length,
        environments: Object.fromEntries(
          ["production", "development"].map((environment) => [
            environment,
            targets.filter((target) => target.environment === environment)
              .length,
          ])
        ),
        sent: count("sent"),
        gone: count("gone"),
        failed: count("failed"),
      },
      "push notifications sent"
    );
    return count("sent");
  } catch (err) {
    logger.error({ err }, "Push notifications weren't sent");
    return 0;
  }
}
