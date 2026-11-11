// What screen readers are told when any of a quest's entries changes, on the
// screens that show several: each team's or player's progress, said as
// announcements.ts says one entry's, with whose it was. Kept apart from it, so
// that screens showing one entry don't download this.
import {
  type ProgressSnapshot,
  describeProgress,
  progressSnapshot,
} from "./announcements";

/** The progress of each of a quest's entries, as far as announcing it goes. */
export interface EntriesSnapshot {
  /** Whether to say whose entry changed: when there's more than one. */
  named: boolean;
  entries: { id: string; name: string; progress: ProgressSnapshot }[];
}

/**
 * Takes the snapshot of the progress of each of a quest's entries.
 * @param entries each entry: its ID, its entrant's name, whether it's paused,
 *  its status, and its steps, in order
 * @returns the snapshot
 */
export function entriesSnapshot(
  entries: readonly {
    id: string;
    name: string;
    paused: boolean;
    status: number;
    steps: Parameters<typeof progressSnapshot>[1];
  }[]
): EntriesSnapshot {
  return {
    named: entries.length > 1,
    entries: entries.map(({ id, name, steps, ...entry }) => ({
      id,
      name,
      progress: progressSnapshot(entry, steps),
    })),
  };
}

/**
 * Describes what changed in each of a quest's entries, saying whose it was
 * when there's more than one, such as "The Reds: The riddle is solved."
 * @param previous the entries' progress before
 * @param current their progress now
 * @returns what to say, or null if nothing worth saying changed
 */
export function describeEntries(
  previous: EntriesSnapshot,
  current: EntriesSnapshot
): string | null {
  const said = current.entries.flatMap(({ id, name, progress }) => {
    const before = previous.entries.find((entry) => entry.id === id);
    const words = before ? describeProgress(before.progress, progress) : null;
    if (words === null) {
      return [];
    }
    return [current.named ? `${name}: ${words}` : words];
  });
  return said.length > 0 ? said.join(" ") : null;
}
