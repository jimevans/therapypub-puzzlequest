import { createHash, randomBytes } from "crypto";
import {
  type PUSH_ENVIRONMENTS,
  type PUSH_PLATFORMS,
  SessionModel,
} from "../models/session.model.js";

/** How long a session lasts after it was last used. */
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How often a session's last use is recorded. Recording it on every request
 * would mean a database write per request; within this, the session's
 * lifetime is extended in steps instead.
 */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** A session that a request presented. */
export interface FoundSession {
  /** The ID of the user the session is for. */
  userId: string;
  /**
   * True if the session's lifetime was just extended, so a cookie holding
   * it should be renewed too.
   */
  renewed: boolean;
}

/**
 * Hashes a session token for storage and lookup.
 * @param token the session token
 * @returns the SHA-256 hash, in hexadecimal
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Starts a session for a user who has signed in.
 * @param userId the user's ID
 * @param userAgent the client's User-Agent header, if any
 * @returns the session token, which only the client keeps
 */
export async function createSession(
  userId: string,
  userAgent = ""
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await SessionModel.create({
    tokenHash: hashSessionToken(token),
    userId,
    createdAt: new Date(now),
    lastUsedAt: new Date(now),
    expiresAt: new Date(now + SESSION_LIFETIME_MS),
    userAgent: userAgent.slice(0, 200),
  });
  return token;
}

/**
 * Finds the session for a token, if it exists and hasn't expired, and
 * records that it was used.
 * @param token the session token
 * @returns the session, or null if there is none
 */
export async function findSession(token: string): Promise<FoundSession | null> {
  const tokenHash = hashSessionToken(token);
  const session = await SessionModel.findOne({ tokenHash }).lean();
  const now = Date.now();
  // MongoDB deletes expired sessions only every minute or so. A session
  // stored before sessions referred to users by ID has no user ID, and
  // counts as ended.
  if (
    session === null ||
    !session.userId ||
    session.expiresAt.getTime() <= now
  ) {
    return null;
  }
  const renewed =
    now - session.lastUsedAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;
  if (renewed) {
    await SessionModel.updateOne(
      { tokenHash },
      {
        $set: {
          lastUsedAt: new Date(now),
          expiresAt: new Date(now + SESSION_LIFETIME_MS),
        },
      }
    );
  }
  return { userId: session.userId.toString(), renewed };
}

/**
 * Ends a session, as signing out does.
 * @param token the session token
 */
export async function deleteSession(token: string): Promise<void> {
  await SessionModel.deleteOne({ tokenHash: hashSessionToken(token) });
}

/**
 * Ends a user's sessions, signing them out everywhere: after a password
 * change or reset, a change to their authorization level, or deletion.
 * @param userId the user's ID
 * @param keepToken a session to keep, such as the one that changed the
 *  password, so that device stays signed in
 */
export async function deleteUserSessions(
  userId: string,
  keepToken?: string
): Promise<void> {
  await SessionModel.deleteMany({
    userId,
    ...(keepToken ? { tokenHash: { $ne: hashSessionToken(keepToken) } } : {}),
  });
}

/** Where an app gets push notifications. */
export interface PushTarget {
  platform: (typeof PUSH_PLATFORMS)[number];
  token: string;
  environment: (typeof PUSH_ENVIRONMENTS)[number];
  /** The kinds of notification wanted; leave it out for every kind. */
  categories?: string[];
}

/** A user's push target, with the session it belongs to. */
export interface UserPushTarget extends PushTarget {
  userId: string;
}

/**
 * Sends a session's push notifications to a phone, replacing any target it
 * had. A phone's token can belong to only one session, so one registered by
 * another session (an earlier sign-in on the same phone) moves to this one.
 * @param token the session token
 * @param target where to send them
 * @returns false if the session has ended
 */
export async function setPushTarget(
  token: string,
  target: PushTarget
): Promise<boolean> {
  const tokenHash = hashSessionToken(token);
  const pushTarget = {
    platform: target.platform,
    token: target.token,
    environment: target.environment,
    ...(target.categories ? { categories: target.categories } : {}),
  };
  // Two tries: a sign-in elsewhere could register the same phone between
  // taking it from other sessions and giving it to this one.
  for (let attempt = 1; ; attempt++) {
    await SessionModel.updateMany(
      { "pushTarget.token": target.token, tokenHash: { $ne: tokenHash } },
      { $unset: { pushTarget: 1 } }
    );
    try {
      const result = await SessionModel.updateOne(
        { tokenHash },
        { $set: { pushTarget } }
      );
      return result.matchedCount > 0;
    } catch (err) {
      if (attempt >= 2 || (err as { code?: number }).code !== 11000) {
        throw err;
      }
    }
  }
}

/**
 * Stops a session's push notifications.
 * @param token the session token
 */
export async function clearPushTarget(token: string): Promise<void> {
  await SessionModel.updateOne(
    { tokenHash: hashSessionToken(token) },
    { $unset: { pushTarget: 1 } }
  );
}

/**
 * Finds where to send users' push notifications of a kind: the push
 * targets of their sessions that haven't ended and want that kind.
 * @param userIds the users
 * @param category the kind of notification
 * @returns the push targets, each with its user
 */
export async function findPushTargets(
  userIds: readonly string[],
  category: string
): Promise<UserPushTarget[]> {
  const sessions = await SessionModel.find(
    {
      userId: { $in: userIds },
      expiresAt: { $gt: new Date() },
      "pushTarget.token": { $exists: true },
      $or: [
        { "pushTarget.categories": { $exists: false } },
        { "pushTarget.categories": category },
      ],
    },
    { userId: 1, pushTarget: 1 }
  ).lean();
  return sessions.flatMap(({ userId, pushTarget }) =>
    pushTarget
      ? [
          {
            userId: userId.toString(),
            platform: pushTarget.platform,
            token: pushTarget.token,
            environment: pushTarget.environment,
            ...(pushTarget.categories
              ? { categories: pushTarget.categories }
              : {}),
          },
        ]
      : []
  );
}

/**
 * Forgets a phone's token, after Apple's or Google's service said it no
 * longer reaches the app.
 * @param token the phone's push token
 */
export async function forgetPushToken(token: string): Promise<void> {
  await SessionModel.updateMany(
    { "pushTarget.token": token },
    { $unset: { pushTarget: 1 } }
  );
}
