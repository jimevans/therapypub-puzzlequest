import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ApiError } from "../../api";
import { useLiveQuest } from "../../live/useLiveQuest";
import { NotAvailable } from "../../quests/NotAvailable";
import { PausedBanner } from "../../quests/PausedBanner";
import { PuzzleContent, preloadPuzzleText } from "../../quests/PuzzleContent";
import { PuzzleHints } from "../../quests/PuzzleHints";
import { PuzzleSolution } from "../../quests/PuzzleSolution";
import { spectatorPuzzleQuery } from "../../quests/queries";
import { STEP_COMPLETED } from "../../quests/status";
import { Banner } from "../../ui/Banner";
import styles from "./FollowAlong.module.css";

preloadPuzzleText();

/** Follow along: one puzzle its players have activated, to read, not to play. */
export function FollowPuzzle() {
  const { name = "", puzzleName = "" } = useParams();
  const { connected } = useLiveQuest(name);
  const view = useQuery(spectatorPuzzleQuery(name, puzzleName));
  const gone = view.error instanceof ApiError && view.error.status === 404;

  return (
    <div
      className={styles.screen}
      data-live-updates={connected ? "connected" : "connecting"}
    >
      {gone ? (
        <NotAvailable what="puzzle" />
      ) : view.data ? (
        <>
          <title>{`${view.data.puzzle.displayName} · PuzzleQuest`}</title>
          <Link
            className={styles.questLink}
            to={`/monitor/quest/${encodeURIComponent(name)}`}
          >
            {view.data.quest.displayName}
          </Link>
          {view.data.quest.paused && <PausedBanner />}
          <h1>{view.data.puzzle.displayName}</h1>
          <PuzzleContent
            displayName={view.data.puzzle.displayName}
            type={view.data.puzzle.type}
            text={view.data.puzzle.text}
          />
          <PuzzleHints hints={view.data.puzzle.hints} />
          {view.data.puzzle.status === STEP_COMPLETED && (
            <PuzzleSolution
              skipped={view.data.puzzle.skipped}
              text={view.data.puzzle.solutionText}
            />
          )}
        </>
      ) : (
        view.isError && (
          <Banner tone="danger">
            Couldn't load this puzzle. Check your connection and try again.
          </Banner>
        )
      )}
    </div>
  );
}
