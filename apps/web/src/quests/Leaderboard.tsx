import type { Schemas } from "@puzzlequest/api-client";
import { Announcement, useAnnouncement } from "../ui/Announcement";
import { ClockTime } from "./ClockTime";
import { entrantName, ordinal } from "./entrants";
import styles from "./Leaderboard.module.css";

type SpectatorQuest = Schemas["SpectatorQuest"];

// The leaderboard's own words. They're here rather than in copy.ts, which
// every screen downloads, since they don't use the transit wording.
const PROVISIONAL =
  "Provisional until every team finishes: a team still playing could beat these times.";
const WHEN_YOU_FINISH =
  "It's a race: the standings will show here once your team finishes.";

/** What's worth announcing about the standings: who has which rank. */
interface RanksSnapshot {
  final: boolean;
  ranks: { id: string; name: string; rank: number | null }[];
}

/**
 * Describes what changed in the standings, such as "The Reds finished 1st."
 * Clocks ticking aren't changes: only a team gaining a rank, and the result.
 * @param previous the standings before
 * @param current the standings now
 * @returns what to say, or null if nothing worth saying changed
 */
function describeRanks(
  previous: RanksSnapshot,
  current: RanksSnapshot
): string | null {
  const said = current.ranks.flatMap(({ id, name, rank }) => {
    const before = previous.ranks.find((entry) => entry.id === id);
    return rank !== null && before?.rank !== rank
      ? [`${name} finished ${ordinal(rank)}.`]
      : [];
  });
  if (current.final && !previous.final) {
    const winners = current.ranks.filter(({ rank }) => rank === 1);
    said.push(
      `Final standings: ${winners.map(({ name }) => name).join(" and ")} won.`
    );
  }
  return said.length > 0 ? said.join(" ") : null;
}

/**
 * A race's leaderboard: each team's or player's rank, status, and time, in
 * the order the API ranks them. Ranks are provisional while anyone still
 * plays; once everyone has finished, the winner is marked, in words as well
 * as looks.
 */
export function Leaderboard({
  quest,
  ownEntryId,
  className,
}: {
  quest: Pick<
    SpectatorQuest,
    "entries" | "racing" | "provisional" | "rivalsHidden"
  >;
  /** The viewer's own entry, if they play, to pick it out. */
  ownEntryId?: string;
  /** Classes to restyle it, as the board does. */
  className?: string;
}) {
  const final = !quest.racing;
  const announcement = useAnnouncement<RanksSnapshot>(
    {
      final,
      ranks: quest.entries.map((entry) => ({
        id: entry.id,
        name: entrantName(entry.entrant),
        rank: entry.rank,
      })),
    },
    describeRanks
  );
  return (
    <div className={`${styles.leaderboard} ${className ?? ""}`}>
      <Announcement message={announcement} />
      <table id="standings" className={styles.table}>
        <caption>{final ? "Final standings" : "Standings"}</caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Team or player</th>
            <th scope="col">Status</th>
            <th scope="col">Time</th>
          </tr>
        </thead>
        <tbody>
          {quest.entries.map((entry) => {
            const winner = final && entry.rank === 1;
            const own = entry.id === ownEntryId;
            return (
              <tr
                key={entry.id}
                data-entry-id={entry.id}
                data-winner={winner || undefined}
                className={`${winner ? styles.winner : ""} ${
                  own ? styles.own : ""
                }`}
              >
                <td className={styles.rank}>
                  {entry.rank === null ? (
                    <>
                      {/* A dash on screen; words for screen readers. */}
                      <span aria-hidden="true">–</span>
                      <span className={styles.hidden}>Not ranked yet</span>
                    </>
                  ) : (
                    ordinal(entry.rank)
                  )}
                </td>
                <th scope="row">
                  {entrantName(entry.entrant)}
                  {winner && (
                    <>
                      {" "}
                      <span className={styles.badge}>Winner</span>
                    </>
                  )}
                  {own && (
                    <>
                      {" "}
                      <span className={styles.badge}>
                        {entry.entrant.kind === "team" ? "Your team" : "You"}
                      </span>
                    </>
                  )}
                </th>
                <td>
                  {entry.statusDescription}
                  {entry.paused && ", paused"}
                </td>
                <td className={styles.time}>
                  {entry.progress.startTime ? (
                    <ClockTime clock={entry.progress} show="total" />
                  ) : (
                    "–"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {quest.provisional && (
        <p id="standings-provisional" className={styles.note}>
          {PROVISIONAL}
        </p>
      )}
      {quest.rivalsHidden && (
        <p id="standings-when-finished" className={styles.note}>
          {WHEN_YOU_FINISH}
        </p>
      )}
    </div>
  );
}
