import { createHash, randomBytes } from "crypto";
import { SessionModel } from "../models/session.model.js";

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
