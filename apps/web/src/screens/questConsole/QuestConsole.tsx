import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, messageOf } from "../../api";
import { useLiveQuest } from "../../live/useLiveQuest";
import { ClockTime } from "../../quests/ClockTime";
import { questQuery } from "../../quests/queries";
import { describeProgress, progressSnapshot } from "../../quests/announcements";
import { QUEST_COMPLETED, QUEST_NOT_STARTED } from "../../quests/status";
import { Announcement, useAnnouncement } from "../../ui/Announcement";
import { ShareLinksSection } from "../../quests/ShareLinksSection";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Dialog } from "../../ui/Dialog";
import dialogStyles from "../../ui/Dialog.module.css";
import { AdminFrame } from "../admin/AdminLayout";
import adminStyles from "../admin/Admin.module.css";
import { ActivityLog } from "./ActivityLog";
import styles from "./QuestConsole.module.css";
import { StopsTable, puzzleLabel } from "./StopsTable";
import { TextMessageDialog } from "./TextMessageDialog";
import { type QuestAction, useQuestAction } from "./consoleData";

type Quest = Schemas["Quest"];
type QuestPuzzle = Quest["puzzles"][number];

/** An action waiting for the administrator to confirm it. */
interface Asking {
  action: QuestAction;
  title: string;
  explanation: string;
  confirmLabel: string;
}

/** Asks before resetting a puzzle, offering to refund its hints' penalties. */
function ResetPuzzleDialog({
  puzzle,
  onCancel,
  onConfirm,
}: {
  puzzle: QuestPuzzle | null;
  onCancel: () => void;
  onConfirm: (refundHints: boolean) => void;
}) {
  const [refundHints, setRefundHints] = useState(false);
  return (
    <Dialog
      id="reset-puzzle-dialog"
      isOpen={puzzle !== null}
      title={puzzle ? `Reset ${puzzleLabel(puzzle)}?` : ""}
      onDismiss={onCancel}
    >
      <p>
        The players will have to solve it again, and every puzzle after it will
        no longer be reached. To correct the puzzle first, pause the quest.
      </p>
      <div className={styles.checkbox}>
        <input
          id="refund-hints"
          type="checkbox"
          checked={refundHints}
          onChange={(event) => setRefundHints(event.target.checked)}
        />
        <label htmlFor="refund-hints">
          Refund the penalties of its revealed hints
        </label>
      </div>
      <div className={dialogStyles.actions}>
        <Button onPress={onCancel}>Keep it</Button>
        <Button
          variant="primary"
          onPress={() => {
            onConfirm(refundHints);
            setRefundHints(false);
          }}
        >
          Reset
        </Button>
      </div>
    </Dialog>
  );
}

function Console({ quest }: { quest: Quest }) {
  const action = useQuestAction(quest.name);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [resetting, setResetting] = useState<QuestPuzzle | null>(null);
  const [texting, setTexting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const encodedName = encodeURIComponent(quest.name);
  const inProgress =
    quest.status !== QUEST_NOT_STARTED && quest.status !== QUEST_COMPLETED;
  const announcement = useAnnouncement(
    progressSnapshot(quest, quest.puzzles),
    describeProgress
  );

  const ask = (asked: Asking) => {
    setNotice(null);
    setAsking(asked);
  };

  return (
    <>
      <Announcement message={announcement} />
      <div className={adminStyles.heading}>
        <h1>{quest.displayName}</h1>
        <div className={styles.actions}>
          {quest.status === QUEST_NOT_STARTED && (
            <Button
              id="start-quest"
              variant="primary"
              isDisabled={quest.puzzles.length === 0}
              onPress={() =>
                ask({
                  action: { kind: "start" },
                  title: `Start ${quest.displayName}?`,
                  explanation:
                    "The first puzzle becomes available for the players to activate.",
                  confirmLabel: "Start",
                })
              }
            >
              Start
            </Button>
          )}
          {inProgress &&
            (quest.paused ? (
              // Different keys make these different buttons. Otherwise React
              // would reuse one, and React Aria keeps the ID it started with.
              <Button
                key="resume"
                id="resume-quest"
                variant="primary"
                onPress={() => action.mutate({ kind: "resume" })}
              >
                Resume
              </Button>
            ) : (
              <Button
                key="pause"
                id="pause-quest"
                onPress={() =>
                  ask({
                    action: { kind: "pause" },
                    title: `Pause ${quest.displayName}?`,
                    explanation:
                      "Its clock stops, and the players can't do anything until you resume it.",
                    confirmLabel: "Pause",
                  })
                }
              >
                Pause
              </Button>
            ))}
          {inProgress && (
            <Button
              id="text-players"
              onPress={() => {
                setNotice(null);
                setTexting(true);
              }}
            >
              Text the players
            </Button>
          )}
          {quest.status !== QUEST_NOT_STARTED && (
            <Button
              id="reset-quest"
              onPress={() =>
                ask({
                  action: { kind: "reset" },
                  title: `Reset ${quest.displayName}?`,
                  explanation:
                    "All of the players' progress is cleared, and the quest goes back to not started. The activity log keeps what happened.",
                  confirmLabel: "Reset",
                })
              }
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {action.isError && (
        <Banner tone="danger">{messageOf(action.error)}</Banner>
      )}
      {notice && <Banner>{notice}</Banner>}
      {quest.paused && (
        <Banner id="paused-banner">
          Paused. The clock is stopped, and the players can&apos;t do anything
          until you resume the quest.
        </Banner>
      )}

      <dl className={styles.summary}>
        <dt>Name</dt>
        <dd>{quest.name}</dd>
        <dt>Assigned to</dt>
        <dd>
          {quest.assignee.name
            ? `${quest.assignee.displayName ?? quest.assignee.name} (${quest.assignee.kind})`
            : quest.assignee.kind === "team"
              ? "A deleted team"
              : "A deleted player"}
        </dd>
        <dt>Status</dt>
        <dd id="quest-status">
          {quest.statusDescription}
          {quest.paused && ", paused"}
        </dd>
        <dt>Time</dt>
        <dd className={styles.time}>
          {quest.progress.startTime ? (
            <ClockTime clock={quest.progress} show="total" />
          ) : (
            "Not started"
          )}
        </dd>
        {quest.textResponse && (
          <>
            <dt>Waiting for the reply</dt>
            <dd id="awaited-reply">
              {quest.textResponse}, then sending &ldquo;
              {quest.textResponseConfirmation}&rdquo;
            </dd>
          </>
        )}
      </dl>

      <ul className={styles.links}>
        <li>
          <Link to={`/monitor/quest/${encodedName}`}>Follow along</Link>
        </li>
        <li>
          <Link to={`/monitor/quest/${encodedName}/board`}>Board</Link>
        </li>
        <li>
          <a
            id="run-book"
            href={`/api/v1/quests/${encodedName}/run-book`}
            download={`${quest.name}.pdf`}
          >
            Run book (PDF)
          </a>
        </li>
        <li>
          <a
            id="qr-cards"
            href={`/api/v1/quests/${encodedName}/qr-cards`}
            download={`${quest.name}-qr-cards.pdf`}
          >
            QR cards to print (PDF)
          </a>
        </li>
        <li>
          <Link id="edit-quest" to={`/quest/${encodedName}/edit`}>
            Edit
          </Link>
        </li>
      </ul>

      <section className={styles.section} aria-labelledby="stops-heading">
        <h2 id="stops-heading">Stops</h2>
        {quest.puzzles.length === 0 ? (
          <p>This quest has no puzzles yet. Edit it to add some.</p>
        ) : (
          <StopsTable
            quest={quest}
            onSkip={(puzzle) =>
              ask({
                action: { kind: "skipPuzzle", puzzleName: puzzle.puzzleName },
                title: `Skip ${puzzleLabel(puzzle)}?`,
                explanation:
                  "It's completed with no penalty, the players see its solution, and the next puzzle becomes available.",
                confirmLabel: "Skip",
              })
            }
            onReset={(puzzle) => {
              setNotice(null);
              setResetting(puzzle);
            }}
          />
        )}
      </section>

      <ShareLinksSection questName={quest.name} />

      <ActivityLog quest={quest} />

      <ConfirmDialog
        id="action-dialog"
        isOpen={asking !== null}
        title={asking?.title ?? ""}
        confirmLabel={asking?.confirmLabel ?? ""}
        cancelLabel="Not now"
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          if (asking) {
            action.mutate(asking.action);
          }
          setAsking(null);
        }}
      >
        {asking?.explanation}
      </ConfirmDialog>
      <ResetPuzzleDialog
        puzzle={resetting}
        onCancel={() => setResetting(null)}
        onConfirm={(refundHints) => {
          if (resetting) {
            action.mutate({
              kind: "resetPuzzle",
              puzzleName: resetting.puzzleName,
              refundHints,
            });
          }
          setResetting(null);
        }}
      />
      <TextMessageDialog
        questName={quest.name}
        isOpen={texting}
        onClose={(sent) => {
          setTexting(false);
          if (sent) {
            setNotice("Message sent.");
          }
        }}
      />
    </>
  );
}

/** The console for running a quest, as administrators see it at its address. */
export default function QuestConsole() {
  const name = useParams().name ?? "";
  const { connected } = useLiveQuest(name);
  const quest = useQuery(questQuery(name));
  const gone = quest.error instanceof ApiError && quest.error.status === 404;

  return (
    <AdminFrame>
      <div data-live-updates={connected ? "connected" : "connecting"}>
        <title>{`${quest.data?.displayName ?? "Quest"} · PuzzleQuest`}</title>
        {gone ? (
          <>
            <h1>Quest not found</h1>
            <Link to="/quests">See every quest</Link>
          </>
        ) : quest.data ? (
          <Console quest={quest.data} />
        ) : (
          quest.isError && (
            <Banner tone="danger">{messageOf(quest.error)}</Banner>
          )
        )}
      </div>
    </AdminFrame>
  );
}
