import type { Schemas } from "@puzzlequest/api-client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ApiError, messageOf } from "../../api";
import { useLiveQuest } from "../../live/useLiveQuest";
import { ClockTime } from "../../quests/ClockTime";
import { questQuery } from "../../quests/queries";
import { copy } from "../../copy";
import {
  describeEntries,
  entriesSnapshot,
} from "../../quests/entryAnnouncements";
import { entrantKey, entrantLabel } from "../../quests/entrants";
import {
  QUEST_COMPLETED,
  QUEST_NOT_STARTED,
  STEP_AWAITING_ACTIVATION,
  STEP_IN_PROGRESS,
} from "../../quests/status";
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
import {
  type EntrantRef,
  type QuestAction,
  useQuestAction,
} from "./consoleData";

type Quest = Schemas["Quest"];
type Entry = Quest["entries"][number];
type QuestPuzzle = Entry["puzzles"][number];

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

/** A quest's entry, and its team or player, as the console needs them. */
interface EntryOf {
  entry: Entry;
  /** Identifies it in the address, such as "team:reds". */
  key: string;
  label: string;
  /** The team or player, by name; missing if deleted. */
  ref?: EntrantRef;
}

/**
 * Describes each of a quest's entries for the console.
 * @param quest the quest
 * @returns its entries, in order
 */
function entriesOf(quest: Quest): EntryOf[] {
  return quest.entries.map((entry) => {
    const { kind, name } = entry.entrant;
    return {
      entry,
      // A deleted team or player has no name, but its entry still has an ID.
      key: entrantKey(entry.entrant) ?? `entry:${entry.id}`,
      label: entrantLabel(entry.entrant),
      ref: name === undefined ? undefined : { kind, name },
    };
  });
}

/** Whether an entry has started and not yet finished. */
function isInProgress(entry: Entry): boolean {
  return entry.status !== QUEST_NOT_STARTED && entry.status !== QUEST_COMPLETED;
}

/** The stop an entry's players are at, or where they are if they aren't. */
function currentStop(entry: Entry): string {
  if (entry.status === QUEST_NOT_STARTED) {
    return "–";
  }
  if (entry.status === QUEST_COMPLETED) {
    return "Finished";
  }
  const index = entry.puzzles.findIndex(
    (puzzle) =>
      puzzle.status === STEP_AWAITING_ACTIVATION ||
      puzzle.status === STEP_IN_PROGRESS
  );
  const puzzle = entry.puzzles[index];
  return puzzle ? `${copy.stepLabel(index + 1)}: ${puzzleLabel(puzzle)}` : "–";
}

/** What the console's actions need to ask before doing anything. */
interface Controls {
  ask: (asked: Asking) => void;
  run: (action: QuestAction) => void;
  text: (recipient: string) => void;
}

/**
 * The actions on one entry: starting, pausing or resuming, texting, and
 * resetting. For a quest with one entry they're the quest's own.
 */
function EntryActions({
  quest,
  of,
  single,
  controls,
}: {
  quest: Quest;
  of: EntryOf;
  single: boolean;
  controls: Controls;
}) {
  const { entry, ref } = of;
  // With no team or player to name (it's been deleted), only a quest's only
  // entry can be run: with no entrant, the actions are the quest's own.
  const target = ref;
  if (!target && !single) {
    return null;
  }
  // The IDs stay as they were before quests could have several entries.
  const idOf = (action: string) => `${action}-${single ? "quest" : "entry"}`;
  const whose = single
    ? quest.displayName
    : `${quest.displayName} for ${of.label}`;
  const inProgress = isInProgress(entry);
  return (
    <div className={styles.actions}>
      {entry.status === QUEST_NOT_STARTED && (
        <Button
          id={idOf("start")}
          variant="primary"
          isDisabled={entry.puzzles.length === 0}
          onPress={() =>
            controls.ask({
              action: { kind: "start", entrant: target },
              title: `Start ${whose}?`,
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
        (entry.paused ? (
          // Different keys make these different buttons. Otherwise React
          // would reuse one, and React Aria keeps the ID it started with.
          <Button
            key="resume"
            id={idOf("resume")}
            variant="primary"
            onPress={() => controls.run({ kind: "resume", entrant: target })}
          >
            Resume
          </Button>
        ) : (
          <Button
            key="pause"
            id={idOf("pause")}
            onPress={() =>
              controls.ask({
                action: { kind: "pause", entrant: target },
                title: `Pause ${whose}?`,
                explanation:
                  "Its clock stops, and the players can't do anything until you resume it.",
                confirmLabel: "Pause",
              })
            }
          >
            Pause
          </Button>
        ))}
      {/* In a race, the quest's own button texts the team chosen at first. */}
      {single && inProgress && (
        <Button id="text-players" onPress={() => controls.text(of.key)}>
          Text the players
        </Button>
      )}
      {entry.status !== QUEST_NOT_STARTED && (
        <Button
          id={idOf("reset")}
          onPress={() =>
            controls.ask({
              action: { kind: "reset", entrant: target },
              title: `Reset ${whose}?`,
              explanation: single
                ? "All of the players' progress is cleared, and the quest goes back to not started. The activity log keeps what happened."
                : `All of ${of.label}'s progress is cleared, and its entry goes back to not started; the others are left as they are. The activity log keeps what happened.`,
              confirmLabel: "Reset",
            })
          }
        >
          Reset
        </Button>
      )}
    </div>
  );
}

/** The actions on every entry at once, for a quest with several. */
function QuestActions({
  quest,
  chosen,
  controls,
}: {
  quest: Quest;
  /** The key of the team or player chosen, to text at first. */
  chosen?: string;
  controls: Controls;
}) {
  const { entries } = quest;
  const ask = (
    kind: "start" | "pause" | "resume" | "reset",
    verb: string,
    explanation: string
  ) =>
    controls.ask({
      action: { kind },
      title: `${verb} ${quest.displayName} for everyone?`,
      explanation,
      confirmLabel: `${verb} all`,
    });
  return (
    <div className={styles.actions}>
      {entries.some((entry) => entry.status === QUEST_NOT_STARTED) && (
        <Button
          id="start-all"
          variant="primary"
          isDisabled={(entries[0]?.puzzles.length ?? 0) === 0}
          onPress={() =>
            ask(
              "start",
              "Start",
              "Each team and player not yet started gets the first puzzle to activate, all at once."
            )
          }
        >
          Start all
        </Button>
      )}
      {entries.some((entry) => isInProgress(entry) && !entry.paused) && (
        <Button
          id="pause-all"
          onPress={() =>
            ask(
              "pause",
              "Pause",
              "Every clock running stops, and no one can do anything until you resume."
            )
          }
        >
          Pause all
        </Button>
      )}
      {entries.some((entry) => isInProgress(entry) && entry.paused) && (
        <Button
          id="resume-all"
          onPress={() =>
            ask(
              "resume",
              "Resume",
              "Every paused team and player can carry on, and their clocks start again."
            )
          }
        >
          Resume all
        </Button>
      )}
      {entries.some(isInProgress) && (
        <Button id="text-players" onPress={() => controls.text(chosen ?? "")}>
          Text the players
        </Button>
      )}
      {entries.some((entry) => entry.status !== QUEST_NOT_STARTED) && (
        <Button
          id="reset-all"
          onPress={() =>
            ask(
              "reset",
              "Reset",
              "Every team's and player's progress is cleared, and the quest goes back to not started. The activity log keeps what happened."
            )
          }
        >
          Reset all
        </Button>
      )}
    </div>
  );
}

/** An entry's status, time, and the reply it's waiting for. */
function EntryFacts({ entry, label }: { entry: Entry; label?: string }) {
  return (
    <>
      {label && (
        <>
          <dt>Entrant</dt>
          <dd>{label}</dd>
        </>
      )}
      <dt>Status</dt>
      <dd id="quest-status">
        {entry.statusDescription}
        {entry.paused && ", paused"}
      </dd>
      <dt>Time</dt>
      <dd className={styles.time}>
        {entry.progress.startTime ? (
          <ClockTime clock={entry.progress} show="total" />
        ) : (
          "Not started"
        )}
      </dd>
      {entry.textResponse && (
        <>
          <dt>Waiting for the reply</dt>
          <dd id="awaited-reply">
            {entry.textResponse}, then sending &ldquo;
            {entry.textResponseConfirmation}&rdquo;
          </dd>
        </>
      )}
    </>
  );
}

/** The stops, as one entry has got on with them, and what can be done. */
function EntryStops({
  quest,
  of,
  Heading,
  controls,
  onReset,
}: {
  quest: Quest;
  of: EntryOf;
  Heading: "h2" | "h3";
  controls: Controls;
  onReset: (resetting: Resetting) => void;
}) {
  const { entry, ref } = of;
  return (
    <section className={styles.section} aria-labelledby="stops-heading">
      <Heading id="stops-heading">Stops</Heading>
      {entry.puzzles.length === 0 ? (
        <p>This quest has no puzzles yet. Edit it to add some.</p>
      ) : (
        <StopsTable
          questName={quest.name}
          entry={entry}
          onSkip={
            ref &&
            ((puzzle) =>
              controls.ask({
                action: {
                  kind: "skipPuzzle",
                  puzzleName: puzzle.puzzleName,
                  entrant: ref,
                },
                title: `Skip ${puzzleLabel(puzzle)}?`,
                explanation:
                  "It's completed with no penalty, the players see its solution, and the next puzzle becomes available.",
                confirmLabel: "Skip",
              }))
          }
          onReset={ref && ((puzzle) => onReset({ puzzle, entrant: ref }))}
        />
      )}
    </section>
  );
}

/** Every team and player in a race, with how each is doing, to choose one. */
function EntrantsTable({
  entries,
  chosen,
}: {
  entries: EntryOf[];
  chosen?: string;
}) {
  return (
    <section className={styles.section} aria-labelledby="entrants-heading">
      <h2 id="entrants-heading">Entrants</h2>
      <p className={styles.note}>
        Choose a team or player to see its stops, run it, and see what it has
        done.
      </p>
      <div className={styles.stopsBox}>
        <table id="entrants-table" className={adminStyles.table}>
          <thead>
            <tr>
              <th scope="col">Entrant</th>
              <th scope="col">Status</th>
              <th scope="col">Time</th>
              <th scope="col">Current stop</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ entry, key, label }) => (
              <tr key={entry.id} data-entrant={key}>
                <th scope="row">
                  {/* The choice is in the address, so it can be linked to;
                      keeping the scroll position, as a tab would. */}
                  <Link
                    to={{ search: `?entry=${encodeURIComponent(key)}` }}
                    preventScrollReset
                    aria-current={key === chosen ? "true" : undefined}
                    className={key === chosen ? styles.chosen : undefined}
                  >
                    {label}
                  </Link>
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
                <td>{currentStop(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A puzzle waiting for the administrator to confirm resetting it. */
interface Resetting {
  puzzle: QuestPuzzle;
  entrant: EntrantRef;
}

function Console({ quest }: { quest: Quest }) {
  const action = useQuestAction(quest.name);
  const [search] = useSearchParams();
  const [asking, setAsking] = useState<Asking | null>(null);
  const [resetting, setResetting] = useState<Resetting | null>(null);
  // Whose players to text at first, or null while not texting.
  const [texting, setTexting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const encodedName = encodeURIComponent(quest.name);
  const entries = entriesOf(quest);
  const single = entries.length === 1;
  // In a race, the entrant chosen to look at closely, if any.
  const chosen = single
    ? entries[0]
    : entries.find(({ key }) => key === search.get("entry"));
  const announcement = useAnnouncement(
    entriesSnapshot(
      entries.map(({ entry, label }) => ({
        id: entry.id,
        name: label,
        paused: entry.paused,
        status: entry.status,
        steps: entry.puzzles,
      }))
    ),
    describeEntries
  );

  const controls: Controls = {
    ask: (asked) => {
      setNotice(null);
      setAsking(asked);
    },
    run: (doing) => action.mutate(doing),
    text: (recipient) => {
      setNotice(null);
      setTexting(recipient);
    },
  };
  const recipients = entries.flatMap(({ key, label, ref }) =>
    ref ? [{ key, label, entrant: ref }] : []
  );

  return (
    <>
      <Announcement message={announcement} />
      <div className={adminStyles.heading}>
        <h1>{quest.displayName}</h1>
        {single && chosen ? (
          <EntryActions quest={quest} of={chosen} single controls={controls} />
        ) : (
          <QuestActions
            quest={quest}
            chosen={chosen?.key}
            controls={controls}
          />
        )}
      </div>

      {action.isError && (
        <Banner tone="danger">{messageOf(action.error)}</Banner>
      )}
      {notice && <Banner>{notice}</Banner>}
      {single && chosen?.entry.paused && (
        <Banner id="paused-banner">
          Paused. The clock is stopped, and the players can&apos;t do anything
          until you resume the quest.
        </Banner>
      )}

      <dl className={styles.summary}>
        <dt>Name</dt>
        <dd>{quest.name}</dd>
        {single && chosen && (
          <EntryFacts entry={chosen.entry} label={chosen.label} />
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

      {single && chosen ? (
        <>
          <EntryStops
            quest={quest}
            of={chosen}
            Heading="h2"
            controls={controls}
            onReset={(chosenPuzzle) => {
              setNotice(null);
              setResetting(chosenPuzzle);
            }}
          />
          <ShareLinksSection questName={quest.name} />
          <ActivityLog quest={quest} />
        </>
      ) : (
        <>
          <EntrantsTable entries={entries} chosen={chosen?.key} />
          {chosen && (
            <section
              id="entry"
              className={`${styles.section} ${styles.entry}`}
              aria-labelledby="entry-heading"
              data-entrant={chosen.key}
            >
              <div className={adminStyles.heading}>
                <h2 id="entry-heading">{chosen.label}</h2>
                <EntryActions
                  quest={quest}
                  of={chosen}
                  single={false}
                  controls={controls}
                />
              </div>
              {chosen.entry.paused && (
                <Banner id="paused-banner">
                  Paused. Its clock is stopped, and its players can&apos;t do
                  anything until you resume it.
                </Banner>
              )}
              <dl className={styles.summary}>
                <EntryFacts entry={chosen.entry} />
              </dl>
              <EntryStops
                quest={quest}
                of={chosen}
                Heading="h3"
                controls={controls}
                onReset={(chosenPuzzle) => {
                  setNotice(null);
                  setResetting(chosenPuzzle);
                }}
              />
              <ActivityLog
                // A new log for each entrant, starting with only its events.
                key={chosen.key}
                quest={quest}
                entrant={chosen.ref}
                Heading="h3"
              />
            </section>
          )}
          <ShareLinksSection questName={quest.name} />
        </>
      )}

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
        puzzle={resetting?.puzzle ?? null}
        onCancel={() => setResetting(null)}
        onConfirm={(refundHints) => {
          if (resetting) {
            action.mutate({
              kind: "resetPuzzle",
              puzzleName: resetting.puzzle.puzzleName,
              refundHints,
              entrant: resetting.entrant,
            });
          }
          setResetting(null);
        }}
      />
      <TextMessageDialog
        questName={quest.name}
        recipients={recipients}
        defaultRecipient={texting ?? ""}
        isOpen={texting !== null}
        onClose={(sent) => {
          setTexting(null);
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
