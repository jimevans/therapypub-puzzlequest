// A share link's token comes in the address's fragment, the part after the #,
// which browsers never send to a server, so it stays out of logs. It's kept
// for the tab, so that following links within the quest keeps working.

const FRAGMENT = /^#share=(.+)$/;

const keyOf = (questName: string) => `pq-share:${questName}`;

/**
 * Makes the address to give someone so they can follow a quest.
 * @param questName the quest's name
 * @param token the share link's token
 * @returns the address
 */
export function shareLinkAddress(questName: string, token: string): string {
  return `${location.origin}/monitor/quest/${encodeURIComponent(questName)}#share=${token}`;
}

/**
 * Finds the token this tab holds for a quest, keeping one from the address.
 * @param questName the quest's name
 * @returns the token, if there is one
 */
function shareTokenFor(questName: string): string | undefined {
  const fromAddress = FRAGMENT.exec(location.hash)?.[1];
  try {
    if (fromAddress) {
      sessionStorage.setItem(keyOf(questName), fromAddress);
    }
    return fromAddress ?? sessionStorage.getItem(keyOf(questName)) ?? undefined;
  } catch {
    // Storage can be refused, as in a private window: the address still works.
    return fromAddress;
  }
}

/**
 * Gets the request options that carry this tab's share link for a quest.
 * @param questName the quest's name
 * @returns the options to add to a request; none without a link
 */
export function shareLinkRequest(questName: string): {
  headers?: Record<string, string>;
} {
  const token = shareTokenFor(questName);
  return token ? { headers: { "X-Share-Token": token } } : {};
}
