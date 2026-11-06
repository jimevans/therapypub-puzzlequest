import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { ApiError } from "../../api";
import { useLiveQuest } from "../../live/useLiveQuest";
import { spectatorQuestQuery } from "../../quests/queries";
import styles from "./Board.module.css";
import { BoardEntry } from "./BoardEntry";

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
    <div
      className={styles.board}
      data-live-updates={connected ? "connected" : "connecting"}
    >
      <title>
        {quest.data ? `${quest.data.displayName} · PuzzleQuest` : "PuzzleQuest"}
      </title>
      <p className={styles.site}>PuzzleQuest</p>
      {gone ? (
        <p className={styles.message}>This quest isn't available.</p>
      ) : quest.data ? (
        <BoardEntry quest={quest.data} />
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
    </div>
  );
}
