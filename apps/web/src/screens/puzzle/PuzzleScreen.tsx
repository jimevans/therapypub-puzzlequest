import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, api, dataOrThrow, messageOf } from "../../api";
import { copy } from "../../copy";
import { useLiveQuest } from "../../live/useLiveQuest";
import { ClockTime } from "../../quests/ClockTime";
import { describePuzzle, isFinished } from "../../quests/announcements";
import { Announcement, useAnnouncement } from "../../ui/Announcement";
import { NotAvailable } from "../../quests/NotAvailable";
import { PausedBanner } from "../../quests/PausedBanner";
import { FinishPanel } from "../../quests/FinishPanel";
import { PuzzleContent, preloadPuzzleText } from "../../quests/PuzzleContent";
import { PuzzleHints } from "../../quests/PuzzleHints";
import { PuzzleSolution } from "../../quests/PuzzleSolution";
import { formatDuration, formatPenalty } from "../../quests/clock";
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
import { LinkButton } from "../../ui/LinkButton";
import { ProgressTrail } from "../../ui/ProgressTrail";
import { Activation } from "./Activation";
import { AnswerForm } from "./AnswerForm";
import styles from "./PuzzleScreen.module.css";
import { type PuzzlePath, usePuzzleAction } from "./puzzleActions";

type View = Schemas["PlayerPuzzle"];

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
      await api.POST(
        "/quests/{questName}/puzzles/{puzzleName}/solution-attempts",
        {
          params: { path },
          body: { guess, connectionId: connectionId() },
        }
      )
    )
  );
  const reveal = usePuzzleAction(path, async (_: void) =>
    dataOrThrow(
      await api.POST("/quests/{questName}/puzzles/{puzzleName}/hints", {
        params: { path },
        body: { connectionId: connectionId() },
      })
    )
  );
  const error = solve.error ?? reveal.error;

  return (
    <>
      {error && <Banner tone="danger">{messageOf(error)}</Banner>}
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
            isDisabled={paused}
            isPending={reveal.isPending}
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
            {nextHint.timePenaltySeconds > 0 &&
              ` (${formatPenalty(nextHint.timePenaltySeconds)})`}
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

function Solved({ path, view }: { path: PuzzlePath; view: View }) {
  const { puzzle, next, quest } = view;
  return (
    <>
      <PuzzleSolution skipped={puzzle.skipped} text={puzzle.solutionText} />
      {next ? (
        <LinkButton
          variant="primary"
          to={`/quest/${encodeURIComponent(path.questName)}/puzzle/${encodeURIComponent(next.puzzleName)}`}
        >
          {copy.goToNextStep(next.displayName)}
        </LinkButton>
      ) : (
        quest.status === QUEST_COMPLETED && (
          <FinishPanel>
            Congratulations! You finished {quest.displayName} in{" "}
            <strong>{formatDuration(quest.progress.totalMs)}</strong>.
          </FinishPanel>
        )
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
  const questPath = `/quest/${encodeURIComponent(path.questName)}`;
  const announcement = useAnnouncement(
    {
      paused: quest.paused,
      status: puzzle.status,
      skipped: puzzle.skipped,
      solutionText: puzzle.solutionText ?? null,
      hints: (puzzle.hints ?? []).map((hint) => hint.text),
      questFinished: isFinished(quest.status),
    },
    describePuzzle
  );
  return (
    <>
      <title>{`${puzzle.displayName} · PuzzleQuest`}</title>
      <Announcement message={announcement} />
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
        <Activation
          path={path}
          paused={quest.paused}
          connectionId={connectionId}
        />
      )}
      {puzzle.type !== null && puzzle.text !== null && (
        <PuzzleContent
          displayName={puzzle.displayName}
          type={puzzle.type}
          text={puzzle.text}
        />
      )}
      <PuzzleHints hints={puzzle.hints} />
      {puzzle.status === STEP_IN_PROGRESS && (
        <Solving path={path} view={view} connectionId={connectionId} />
      )}
      {puzzle.status === STEP_COMPLETED && <Solved path={path} view={view} />}
    </>
  );
}

function PuzzleLoader({ path }: { path: PuzzlePath }) {
  const { connected, connectionId } = useLiveQuest(path.questName);
  const view = useQuery(puzzleQuery(path.questName, path.puzzleName));

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
    <PuzzleLoader
      key={`${name}/${puzzleName}`}
      path={{ questName: name, puzzleName }}
    />
  );
}
