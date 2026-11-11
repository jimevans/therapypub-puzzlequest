// Who plays a quest: its entrants, each a team or a player on their own, and
// each with its own entry, which holds its progress. A quest played by one team
// has one entry; a race has several.
import type { Schemas } from "@puzzlequest/api-client";
import { QUEST_COMPLETED, QUEST_NOT_STARTED } from "./status";

/** A quest's status, as the API gives it. */
type QuestStatus = Schemas["QuestStatus"];

/** A team or player playing a quest, however much of it the API gives. */
export interface Entrant {
  kind: Schemas["EntrantKind"];
  /** Null if the user or team has been deleted; missing if it isn't shown. */
  name?: string | null;
  /** Null if the user or team has been deleted. */
  displayName?: string | null;
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
  return entrant.name == null ? undefined : `${entrant.kind}:${entrant.name}`;
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
  entries: readonly { status: QuestStatus }[]
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

// A race's leaderboard: the API ranks the entries that have finished, and
// these say and sort the ranks.

const ordinals = new Intl.PluralRules("en", { type: "ordinal" });
const SUFFIXES: Record<string, string> = {
  one: "st",
  two: "nd",
  few: "rd",
  other: "th",
};

/**
 * Says a rank as a place, such as "1st" or "22nd".
 * @param rank the rank, from 1
 * @returns the place
 */
export function ordinal(rank: number): string {
  return `${rank}${SUFFIXES[ordinals.select(rank)] ?? "th"}`;
}

/** What placing an entry on the leaderboard needs. */
interface Placed {
  /** Missing or null until it has finished. */
  rank?: number | null;
  status: QuestStatus;
}

/** Where an entry goes: ranked first, then playing, then not started. */
function placeOf({ rank, status }: Placed): number {
  if (rank != null) {
    return 0;
  }
  return status === QUEST_NOT_STARTED ? 2 : 1;
}

/**
 * Puts entries in leaderboard order, as the public view has them: those
 * ranked, by rank, then those playing, then those yet to start, each of those
 * in the order given.
 * @param items the entries, or things holding them, in the quest's order
 * @param entryOf gets an item's entry
 * @returns a sorted copy
 */
export function inLeaderboardOrder<Item>(
  items: readonly Item[],
  entryOf: (item: Item) => Placed
): Item[] {
  // Sorting is stable, so entries that compare equal keep their order.
  return [...items].sort((a, b) => {
    const [first, second] = [entryOf(a), entryOf(b)];
    return (
      placeOf(first) - placeOf(second) || (first.rank ?? 0) - (second.rank ?? 0)
    );
  });
}
