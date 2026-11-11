import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { ApiError } from "../../api";
import { Leaderboard } from "../../quests/Leaderboard";
import { useLiveQuest } from "../../live/useLiveQuest";
import { spectatorQuestQuery } from "../../quests/queries";
import { FocusOnNavigate } from "../../ui/FocusOnNavigate";
import styles from "./Board.module.css";
import { BoardEntry } from "./BoardEntry";

/**
 * The quest's entries: its one team or player filling the screen, or, in a
 * race, the leaderboard, which stays up once the race is over.
 */
function Entries({ quest }: { quest: Schemas["SpectatorQuest"] }) {
  const [only] = quest.entries;
  // A player still racing sees one entry, their own, but it's still a race.
  if (quest.entries.length === 1 && only && !quest.racing) {
    return <BoardEntry title={quest.displayName} entry={only} />;
  }
  return (
    <>
      <h1 className={styles.raceName}>{quest.displayName}</h1>
      <Leaderboard quest={quest} className={styles.leaderboard} />
    </>
  );
}

/**
 * A quest on a big screen, to read from across a room. Anyone can open it, so,
 * like following along, it shows nothing more than a player can see. Nobody's
 * watching it closely, so it says when it has lost its connection, rather than
 * leaving a clock running on old information.
 */
export function Board() {
  const name = useParams().name ?? "";
  const { connected } = useLiveQuest(name);
  const quest = useQuery(spectatorQuestQuery(name));
  const gone = quest.error instanceof ApiError && quest.error.status === 404;

  return (
    <main
      className={styles.board}
      data-live-updates={connected ? "connected" : "connecting"}
      data-quest-name={quest.data?.name}
    >
      <FocusOnNavigate />
      <title>
        {quest.data ? `${quest.data.displayName} · PuzzleQuest` : "PuzzleQuest"}
      </title>
      <p className={styles.site}>PuzzleQuest</p>
      {gone ? (
        <p className={styles.message}>This quest isn't available.</p>
      ) : quest.data ? (
        <Entries quest={quest.data} />
      ) : (
        quest.isError && (
          <p className={styles.message}>
            Can't reach PuzzleQuest. Trying again…
          </p>
        )
      )}
      {!connected && !gone && quest.data && (
        <p
          id="board-reconnecting"
          className={styles.reconnecting}
          role="status"
        >
          Reconnecting…
        </p>
      )}
    </main>
  );
}
