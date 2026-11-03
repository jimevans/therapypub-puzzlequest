import * as SessionService from "../src/services/session.service.js";

/**
 * Starts a real session for each user, for integration tests to sign in
 * with. The users must exist for their requests to count as signed in.
 * @param userNames the users
 * @returns each user's session token, by user name
 */
export async function startSessions(
  ...userNames: string[]
): Promise<Record<string, string>> {
  const tokens: Record<string, string> = {};
  for (const userName of userNames) {
    tokens[userName] = await SessionService.createSession(userName);
  }
  return tokens;
}
