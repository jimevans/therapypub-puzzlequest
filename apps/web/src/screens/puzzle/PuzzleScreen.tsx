import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, api, dataOrThrow } from "../../api";
import { copy } from "../../copy";
import { useLiveQuest } from "../../live/useLiveQuest";
import { ClockTime } from "../../quests/ClockTime";
import { NotAvailable } from "../../quests/NotAvailable";
import { PausedBanner } from "../../quests/PausedBanner";
import { formatDuration } from "../../quests/clock";
import { puzzleQuery } from "../../quests/queries";
import {
  QUEST_COMPLETED,
  STEP_AWAITING_ACTIVATION,
  STEP_COMPLETED,
  STEP_IN_PROGRESS,
} from "../../quests/status";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ProgressTrail } from "../../ui/ProgressTrail";
import { Activation } from "./Activation";
import { AnswerForm } from "./AnswerForm";
import { PuzzleContent, preloadPuzzleText } from "./PuzzleContent";
import styles from "./PuzzleScreen.module.css";
import { type PuzzlePath, refusalOf, usePuzzleAction } from "./puzzleActions";

type View = Schemas["PlayerPuzzle"];

function penaltyText(seconds: number): string {
  return `+${formatDuration(seconds * 1000)}`;
}

function Hints({ hints }: { hints: View["puzzle"]["hints"] }) {
  if (hints.length === 0) {
    return null;
  }
  return (
    <ol id="hints" className={styles.hints}>
      {hints.map((hint, index) => (
        <li key={index} className={styles.hint}>
          <span className={styles.hintHeading}>
            Hint {index + 1}
            {hint.timePenalty > 0 && `, ${penaltyText(hint.timePenalty)}`}
          </span>
          {hint.text}
        </li>
      ))}
    </ol>
  );
}

function Solving({
  path,
  view,
  connectionId,
}: {
  path: PuzzlePath;
  view: View;
  connectionId: () => string | undefined;
}) {
  const { nextHint } = view.puzzle;
  const paused = view.quest.paused;
  const [isWarning, setIsWarning] = useState(false);
  const solve = usePuzzleAction(path, async (guess: string) =>
    dataOrThrow(
      await api.POST("/quests/{name}/puzzles/{puzzleName}/solution-attempts", {
        params: { path },
        body: { guess, connectionId: connectionId() },
      })
    )
  );
  const reveal = usePuzzleAction(path, async (_: void) =>
    dataOrThrow(
      await api.POST("/quests/{name}/puzzles/{puzzleName}/hints", {
        params: { path },
        body: { connectionId: connectionId() },
      })
    )
  );
  const error = solve.error ?? reveal.error;

  return (
    <>
      {error && <Banner tone="danger">{refusalOf(error)}</Banner>}
      <AnswerForm
        fieldId="guess"
        buttonId="check-answer"
        label="Your answer"
        buttonLabel="Check answer"
        emptyMessage="Enter your answer"
        isDisabled={paused}
        isPending={solve.isPending}
        onSubmit={(guess) => {
          reveal.reset();
          solve.mutate(guess);
        }}
      >
        {nextHint && (
          <Button
            id="reveal-hint"
            isDisabled={paused || reveal.isPending}
            onPress={() => {
              solve.reset();
              if (nextHint.solutionWarning) {
                setIsWarning(true);
              } else {
                reveal.mutate();
              }
            }}
          >
            Reveal next hint
            {nextHint.timePenalty > 0 &&
              ` (${penaltyText(nextHint.timePenalty)})`}
          </Button>
        )}
      </AnswerForm>
      <ConfirmDialog
        id="solution-warning"
        isOpen={isWarning}
        title="Give away the solution?"
        confirmLabel="Show it"
        cancelLabel="Keep trying"
        onCancel={() => setIsWarning(false)}
        onConfirm={() => {
          setIsWarning(false);
          reveal.mutate();
        }}
      >
        The next hint shows you the solution.
      </ConfirmDialog>
    </>
  );
}

/** The moment the quest ends: the line reaches its last stop. */
function Finish({ view }: { view: View }) {
  return (
    <section id="quest-finished" className={styles.finish}>
      <div className={styles.finishLine} aria-hidden="true">
        <span className={styles.finishRail} />
        <span className={styles.finishStop} />
      </div>
      <h2>{copy.questFinished}</h2>
      <p>
        Congratulations! You finished {view.quest.displayName} in{" "}
        <strong>{formatDuration(view.quest.progress.totalMs)}</strong>.
      </p>
    </section>
  );
}

function Solved({ path, view }: { path: PuzzlePath; view: View }) {
  const { puzzle, next, quest } = view;
  return (
    <>
      <section id="solution" className={styles.solution}>
        <h2>{puzzle.skipped ? "Skipped" : "Solved"}</h2>
        <p id="solution-text">{puzzle.solutionText}</p>
      </section>
      {next ? (
        <Link
          className={styles.onward}
          to={`/quest/${encodeURIComponent(path.name)}/puzzle/${encodeURIComponent(next.name)}`}
        >
          {copy.goToNextStep(next.displayName)}
        </Link>
      ) : (
        quest.status === QUEST_COMPLETED && <Finish view={view} />
      )}
    </>
  );
}

function PuzzleDetails({
  path,
  view,
  connectionId,
}: {
  path: PuzzlePath;
  view: View;
  connectionId: () => string | undefined;
}) {
  const { quest, puzzle } = view;
  const questPath = `/quest/${encodeURIComponent(path.name)}`;
  return (
    <>
      <title>{`${puzzle.displayName} · PuzzleQuest`}</title>
      <div className={styles.questBar}>
        <Link to={questPath}>{quest.displayName}</Link>
        <ClockTime
          className={styles.clock}
          clock={quest.progress}
          show="total"
        />
      </div>
      {quest.paused && <PausedBanner />}
      <ProgressTrail
        stepNumber={puzzle.stopNumber}
        done={puzzle.status === STEP_COMPLETED}
        open={quest.status !== QUEST_COMPLETED}
      />
      <p className={styles.stepNumber}>{copy.stepLabel(puzzle.stopNumber)}</p>
      <h1>{puzzle.displayName}</h1>
      {puzzle.status === STEP_AWAITING_ACTIVATION && (
        <Activation path={path} paused={quest.paused} />
      )}
      {puzzle.type !== null && puzzle.text !== null && (
        <PuzzleContent
          displayName={puzzle.displayName}
          type={puzzle.type}
          text={puzzle.text}
        />
      )}
      <Hints hints={puzzle.hints} />
      {puzzle.status === STEP_IN_PROGRESS && (
        <Solving path={path} view={view} connectionId={connectionId} />
      )}
      {puzzle.status === STEP_COMPLETED && <Solved path={path} view={view} />}
    </>
  );
}

function PuzzleLoader({ path }: { path: PuzzlePath }) {
  const { connected, connectionId } = useLiveQuest(path.name);
  const view = useQuery(puzzleQuery(path.name, path.puzzleName));

  // Resetting a quest makes its puzzles disappear, so this overrides what's on
  // screen. Any other failure leaves the last known state showing, since a phone
  // in a dead zone will catch up by itself.
  const gone = view.error instanceof ApiError && view.error.status === 404;

  return (
    <div
      className={styles.screen}
      data-live-updates={connected ? "connected" : "connecting"}
    >
      {gone ? (
        <NotAvailable what="puzzle" />
      ) : view.data ? (
        <PuzzleDetails
          path={path}
          view={view.data}
          connectionId={connectionId}
        />
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

preloadPuzzleText();

/** One puzzle, by its state: waiting to be activated, being solved, or solved. */
export function PuzzleScreen() {
  const { name = "", puzzleName = "" } = useParams();
  // A new puzzle starts afresh, without the last one's typing or errors.
  return (
    <PuzzleLoader key={`${name}/${puzzleName}`} path={{ name, puzzleName }} />
  );
}
