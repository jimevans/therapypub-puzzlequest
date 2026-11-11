import { QuestStatus } from "./state.js";

/** What ranking an entry needs: how far it has got, and its score. */
export interface Rankable {
  /** The entry's status: not started, in progress, or completed. */
  readonly status: QuestStatus;
  /** The entry's score: its time plus hint penalties. Lower is better. */
  readonly totalMs: number;
}

/** An entry in its place on the leaderboard. */
export interface Ranked<T> {
  readonly entry: T;
  /**
   * Its rank, from 1, once it has completed the quest; entries with the same
   * score share a rank. Null while it hasn't completed.
   */
  readonly rank: number | null;
}

/** A quest's entries in leaderboard order. */
export interface Standings<T> {
  /**
   * Every entry: those that have completed, best score first, then those in
   * progress, then those not started, each of those two in entry order.
   */
  readonly entries: readonly Ranked<T>[];
  /**
   * True while the ranks could still change: some entry has a rank, and some
   * hasn't completed yet, so could still beat it.
   */
  readonly provisional: boolean;
}

/** Where each status's entries go on the leaderboard, first to last. */
const PLACE: Record<QuestStatus, number> = {
  [QuestStatus.COMPLETED]: 0,
  [QuestStatus.IN_PROGRESS]: 1,
  [QuestStatus.NOT_STARTED]: 2,
};

/**
 * Ranks a quest's entries, by standard competition ranking: entries with the
 * same score share a rank, and the next rank skips as many places (1, 2, 2,
 * 4). Only entries that have completed the quest are ranked.
 * @param entries the quest's entries, in entry order
 * @returns the entries in leaderboard order, with their ranks
 */
export function rankEntries<T extends Rankable>(
  entries: readonly T[]
): Standings<T> {
  // Array.prototype.sort is stable, so entries that compare equal keep their
  // entry order.
  const sorted = [...entries].sort(
    (a, b) =>
      PLACE[a.status] - PLACE[b.status] ||
      (a.status === QuestStatus.COMPLETED ? a.totalMs - b.totalMs : 0)
  );
  const ranked: Ranked<T>[] = [];
  sorted.forEach((entry, index) => {
    const previous = ranked[index - 1];
    let rank: number | null = null;
    if (entry.status === QuestStatus.COMPLETED) {
      // Those that completed come first, so the one before, if any, did too.
      rank =
        previous && previous.entry.totalMs === entry.totalMs
          ? previous.rank
          : index + 1;
    }
    ranked.push({ entry, rank });
  });
  return {
    entries: ranked,
    provisional:
      ranked.some(({ rank }) => rank !== null) &&
      ranked.some(({ rank }) => rank === null),
  };
}
