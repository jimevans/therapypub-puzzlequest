// Sending to Android phones through Firebase Cloud Messaging's HTTP v1 API.
// Requests carry an OAuth access token, got from Google by signing a JSON Web
// Token with the Firebase project's service account key, and reused until
// near its end.
import { createSign } from "node:crypto";
import type { FcmServiceAccount } from "../config.js";
import { logger } from "../logger.js";
import type { PushNotification, PushSender } from "./types.js";

/** The settings FCM needs. */
export interface FcmSettings {
  serviceAccount: FcmServiceAccount;
  /** Where FCM is; tests point it elsewhere. */
  origin?: string;
  /** How to make requests; tests replace it. */
  fetch?: typeof fetch;
  /** The clock, in milliseconds; tests replace it. */
  now?: () => number;
}

/** How long a request to Google may take. */
const REQUEST_TIMEOUT_MS = 10_000;

/** How long before an access token's end a new one is got. */
const RENEW_BEFORE_MS = 5 * 60 * 1000;

/**
 * Creates a sender to Android phones.
 * @param settings the service account
 * @returns the sender
 */
export function createFcmSender(settings: FcmSettings): PushSender {
  const account = settings.serviceAccount;
  const origin = settings.origin ?? "https://fcm.googleapis.com";
  const request = settings.fetch ?? fetch;
  const now = settings.now ?? Date.now;
  let access: { token: string; expires: number } | undefined;

  /** An access token for FCM, got afresh when the last is near its end. */
  async function accessToken(): Promise<string> {
    if (access && access.expires - RENEW_BEFORE_MS > now()) {
      return access.token;
    }
    const issued = Math.floor(now() / 1000);
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: account.token_uri,
      iat: issued,
      exp: issued + 3600,
    })}`;
    const signature = createSign("RSA-SHA256")
      .update(unsigned)
      .sign(account.private_key, "base64url");
    const response = await request(account.token_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${signature}`,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `Google refused the service account's sign-in (${response.status})`
      );
    }
    const answer = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    access = {
      token: answer.access_token,
      expires: now() + answer.expires_in * 1000,
    };
    return access.token;
  }

  return {
    async send(target, notification) {
      let response;
      try {
        response = await request(
          `${origin}/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${await accessToken()}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(fcmMessage(target.token, notification)),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          }
        );
      } catch (err) {
        logger.warn(
          { err },
          "A push notification to an Android phone wasn't sent"
        );
        return "failed";
      }
      if (response.ok) {
        return "sent";
      }
      const errorCode = await parseErrorCode(response);
      if (response.status === 404 || errorCode === "UNREGISTERED") {
        return "gone";
      }
      if (response.status === 401) {
        // A refused access token: get a new one next time.
        access = undefined;
      }
      logger.warn(
        { status: response.status, errorCode },
        "Firebase refused a push notification"
      );
      return "failed";
    },
    close() {},
  } satisfies PushSender;
}

/**
 * Builds FCM's message: a notification, grouped by quest, with the
 * notification's details as data, which FCM requires to be strings.
 * @param token the phone's token
 * @param notification the notification
 * @returns the request body's message
 */
export function fcmMessage(
  token: string,
  notification: PushNotification
): object {
  return {
    message: {
      token,
      notification: { title: notification.title, body: notification.body },
      data: {
        category: notification.category,
        questName: notification.questName,
        ...(notification.puzzleName
          ? { puzzleName: notification.puzzleName }
          : {}),
      },
      android: { notification: { tag: notification.questName } },
    },
  };
}

/**
 * Reads FCM's error code from a refused request, such as UNREGISTERED.
 * @param response the response
 * @returns the error code, if there is one
 */
async function parseErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as {
      error?: { details?: { errorCode?: string }[] };
    };
    return body.error?.details?.find((detail) => detail.errorCode)?.errorCode;
  } catch {
    return undefined;
  }
}
