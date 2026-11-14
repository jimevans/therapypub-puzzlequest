// Sending to iPhones through Apple's Push Notification service (APNs), with
// token-based authentication: each request carries a short JSON Web Token
// signed with the Apple Developer account's key, over HTTP/2, which Node
// speaks itself. One connection to each of Apple's environments is kept
// open and reused, as Apple asks. Apple's keys can be limited to one
// environment, so the sandbox (where apps built and run from Xcode
// register) may have a key of its own.
import { sign } from "node:crypto";
import {
  type ClientHttp2Session,
  connect,
  constants as http2,
} from "node:http2";
import { logger } from "../logger.js";
import type { PushTarget } from "../services/session.service.js";
import type { PushNotification, PushSender } from "./types.js";

/** A signing key: a .p8 file's contents, and its ID. */
export interface ApnsKey {
  key: string;
  keyId: string;
}

/** The settings APNs needs. */
export interface ApnsSettings extends ApnsKey {
  /**
   * The sandbox's own key, for apps built and run from Xcode, when the key
   * above is limited to production (App Store and TestFlight apps); without
   * it, the key above signs for both.
   */
  sandbox?: ApnsKey;
  teamId: string;
  /** The app's bundle ID, which notifications are addressed to. */
  bundleId: string;
  /** Where each environment's service is; tests point these elsewhere. */
  origins?: Record<PushTarget["environment"], string>;
  /** The clock, in milliseconds; tests replace it. */
  now?: () => number;
}

/** Apple's services, by environment. */
const APPLE_ORIGINS: Record<PushTarget["environment"], string> = {
  production: "https://api.push.apple.com",
  development: "https://api.sandbox.push.apple.com",
};

/**
 * How long a signed token is reused. Apple refuses one older than an hour,
 * and one renewed more often than every 20 minutes.
 */
const TOKEN_LIFETIME_MS = 50 * 60 * 1000;

/** How long a request to Apple may take. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Apple's reasons for refusing a token that mean it no longer reaches the
 * app. BadDeviceToken also covers a token from the other environment, which
 * an app sends only if it's built wrongly; it registers again when launched.
 */
const GONE_REASONS = new Set(["BadDeviceToken", "Unregistered"]);

/**
 * Creates a sender to iPhones.
 * @param settings the account's key and the app's bundle ID
 * @returns the sender
 */
export function createApnsSender(settings: ApnsSettings): PushSender {
  const origins = settings.origins ?? APPLE_ORIGINS;
  const now = settings.now ?? Date.now;
  const sessions = new Map<string, ClientHttp2Session>();
  /** Each environment's key: the sandbox's own, if it has one. */
  const keys: Record<PushTarget["environment"], ApnsKey> = {
    production: settings,
    development: settings.sandbox ?? settings,
  };
  /** Each environment's signed token, reused until near its end. */
  const signed = new Map<
    PushTarget["environment"],
    { token: string; at: number }
  >();

  /**
   * The bearer token for an environment, signed with its key afresh when
   * the last is near its end.
   */
  function bearerToken(environment: PushTarget["environment"]): string {
    const time = now();
    const last = signed.get(environment);
    if (last && time - last.at < TOKEN_LIFETIME_MS) {
      return last.token;
    }
    const { key, keyId } = keys[environment];
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "ES256", kid: keyId })}.${encode({
      iss: settings.teamId,
      iat: Math.floor(time / 1000),
    })}`;
    const signature = sign("sha256", Buffer.from(unsigned), {
      key,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url");
    const token = `${unsigned}.${signature}`;
    signed.set(environment, { token, at: time });
    return token;
  }

  /** The open connection to an environment's service, opened if need be. */
  function session(origin: string): ClientHttp2Session {
    const open = sessions.get(origin);
    if (open && !open.closed && !open.destroyed) {
      return open;
    }
    const created = connect(origin);
    // An idle connection doesn't keep the server from stopping.
    created.unref();
    const forget = () => {
      if (sessions.get(origin) === created) {
        sessions.delete(origin);
      }
    };
    created.on("close", forget);
    created.on("goaway", forget);
    created.on("error", (err) => {
      logger.warn({ err }, "The connection to Apple's push service failed");
      forget();
    });
    sessions.set(origin, created);
    return created;
  }

  /**
   * Posts a notification to Apple.
   * @returns the response's status and body
   */
  function post(
    environment: PushTarget["environment"],
    deviceToken: string,
    payload: string
  ): Promise<{ status: number; body: string }> {
    const origin = origins[environment];
    return new Promise((resolve, reject) => {
      const request = session(origin).request({
        [http2.HTTP2_HEADER_METHOD]: "POST",
        [http2.HTTP2_HEADER_PATH]: `/3/device/${encodeURIComponent(deviceToken)}`,
        authorization: `bearer ${bearerToken(environment)}`,
        "apns-topic": settings.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
      request.setTimeout(REQUEST_TIMEOUT_MS, () =>
        request.close(http2.NGHTTP2_CANCEL)
      );
      let status = 0;
      let body = "";
      request.setEncoding("utf8");
      request.on("response", (headers) => {
        status = Number(headers[http2.HTTP2_HEADER_STATUS]);
      });
      request.on("data", (chunk: string) => (body += chunk));
      request.on("end", () =>
        status
          ? resolve({ status, body })
          : reject(new Error("Apple's push service didn't answer"))
      );
      request.on("error", reject);
      request.end(payload);
    });
  }

  return {
    async send(target, notification) {
      const payload = JSON.stringify(apnsPayload(notification));
      let response;
      try {
        response = await post(target.environment, target.token, payload);
      } catch (err) {
        logger.warn({ err }, "A push notification to an iPhone wasn't sent");
        return "failed";
      }
      if (response.status === 200) {
        return "sent";
      }
      const reason = parseReason(response.body);
      if (response.status === 410 || GONE_REASONS.has(reason ?? "")) {
        return "gone";
      }
      if (response.status === 403) {
        // A refused key or token: sign a new one next time.
        signed.delete(target.environment);
      }
      logger.warn(
        { status: response.status, reason, environment: target.environment },
        "Apple's push service refused a notification"
      );
      return "failed";
    },
    close() {
      for (const open of sessions.values()) {
        open.close();
      }
      sessions.clear();
    },
  } satisfies PushSender;
}

/**
 * Builds what Apple delivers to the app: an alert, grouped by quest, with
 * the notification's details as custom keys.
 * @param notification the notification
 * @returns the payload
 */
export function apnsPayload(notification: PushNotification): object {
  return {
    aps: {
      alert: { title: notification.title, body: notification.body },
      sound: "default",
      "thread-id": notification.questName,
    },
    category: notification.category,
    questName: notification.questName,
    ...(notification.puzzleName ? { puzzleName: notification.puzzleName } : {}),
  };
}

/**
 * Reads the reason from Apple's answer to a refused notification.
 * @param body the response body
 * @returns the reason, such as Unregistered, if there is one
 */
function parseReason(body: string): string | undefined {
  try {
    const reason = (JSON.parse(body) as { reason?: unknown }).reason;
    return typeof reason === "string" ? reason : undefined;
  } catch {
    return undefined;
  }
}
