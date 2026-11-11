// Who plays a quest: its entrants, each a team or a player on their own, and
// each with its own entry, which holds its progress. A quest played by one team
// has one entry; a race has several.
import { QUEST_COMPLETED, QUEST_NOT_STARTED } from "./status";

/** A team or player playing a quest, however much of it the API gives. */
export interface Entrant {
  kind: "user" | "team";
  /** Missing if the user or team has been deleted, or isn't shown. */
  name?: string;
  displayName?: string;
}

/** The kind of entrant, in words. */
function kindOf(entrant: Pick<Entrant, "kind">): string {
  return entrant.kind === "team" ? "team" : "player";
}

/**
 * Names an entrant, such as "The Reds".
 * @param entrant the team or player
 * @returns its display name, or what it was if it's been deleted
 */
export function entrantName(entrant: Entrant): string {
  return entrant.displayName ?? entrant.name ?? `A deleted ${kindOf(entrant)}`;
}

/**
 * Names an entrant with its kind, for staff and administrators, such as
 * "The Reds (team)".
 * @param entrant the team or player
 * @returns the name
 */
export function entrantLabel(entrant: Entrant): string {
  return entrant.displayName || entrant.name
    ? `${entrantName(entrant)} (${kindOf(entrant)})`
    : entrantName(entrant);
}

/**
 * Identifies an entrant within a quest, for an address, such as "team:reds".
 * @param entrant the team or player
 * @returns the key, or undefined if the entrant has been deleted
 */
export function entrantKey(entrant: Entrant): string | undefined {
  return entrant.name === undefined
    ? undefined
    : `${entrant.kind}:${entrant.name}`;
}

/** Where entries have got to, as far as the order of a list goes. */
export type QuestProgressState = "underWay" | "notStarted" | "finished";

/**
 * Says where a quest's entries have got to, all told: under way if any has
 * started and not finished, otherwise not started if any hasn't, otherwise
 * finished.
 * @param entries the quest's entries
 * @returns the state
 */
export function overallState(
  entries: readonly { status: number }[]
): QuestProgressState {
  if (
    entries.some(
      ({ status }) => status !== QUEST_NOT_STARTED && status !== QUEST_COMPLETED
    )
  ) {
    return "underWay";
  }
  return entries.some(({ status }) => status === QUEST_NOT_STARTED)
    ? "notStarted"
    : "finished";
}
