import type {
  HintRevealed,
  PuzzleSolved,
  PuzzleStarted,
  QuestEvent,
} from "../domain/quest/index.js";
import { log } from "../logger.js";
import type { AssigneeRef } from "../services/playerUpdates.service.js";

/**
 * A quest event as published, with the details players' screens show. The
 * rules decide what happened; the service adds these from the puzzle
 * definitions.
 */
export type PublishedQuestEvent =
  | Exclude<QuestEvent, PuzzleSolved | PuzzleStarted | HintRevealed>
  | (PuzzleSolved & {
      /** The solution text shown to the players. */
      solutionText: string;
      /** The puzzle's display name. */
      displayName: string;
    })
  | (PuzzleStarted & {
      /** The puzzle's display name. */
      displayName: string;
    })
  | (HintRevealed & {
      /** The text of the hint. */
      hintText: string;
      /** The puzzle's next hint, or null if this was its last. */
      nextHint: {
        /** Its time penalty, in seconds. */
        timePenalty: number;
        /** True if it gives away the solution. */
        solutionWarning: boolean;
      } | null;
    });

/** Who or what caused an action on a quest. */
export interface QuestActionOrigin {
  /** The user name of whoever acted; omitted when the system acted. */
  actor?: string;
  /**
   * The websocket connection of the browser the action came from. That
   * browser already shows the result, so live updates leave it out.
   */
  connectionId?: string;
}

/** The events of one successful action on a quest, in order. */
export interface QuestActivity extends QuestActionOrigin {
  /** The name of the quest. */
  questName: string;
  /** What happened. */
  events: readonly PublishedQuestEvent[];
  /** The entry the events happened in, and the user or team playing it. */
  entry: { id: string; assignee: AssigneeRef };
  /**
   * True if, after the action, the quest is a race that not every entry has
   * finished: several entries, not all completed. Only staff and the entry's
   * own players are then sent what happened.
   */
  racing: boolean;
}

/** Receives quest activity. */
export type QuestActivityHandler = (
  activity: QuestActivity
) => void | Promise<void>;

/**
 * Passes each quest action's events to everything that reacts to them, such
 * as live updates and the event log, so the code that changes quests doesn't
 * need to know about them.
 */
export class QuestEventBus {
  private readonly handlers = new Set<QuestActivityHandler>();

  /**
   * Adds a handler for every activity published from now on.
   * @param handler the handler
   * @returns a function that removes the handler
   */
  subscribe(handler: QuestActivityHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Passes activity to every handler, and waits for them. The action has
   * already been saved, so a handler that fails is logged and doesn't affect
   * the others or the caller.
   * @param activity the activity
   */
  async publish(activity: QuestActivity): Promise<void> {
    await Promise.all(
      [...this.handlers].map(async (handler) => {
        try {
          await handler(activity);
        } catch (err) {
          log().error(
            { err, questName: activity.questName },
            "handling quest activity failed"
          );
        }
      })
    );
  }
}

/** The application's quest event bus. */
export const questEventBus = new QuestEventBus();
