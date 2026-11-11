import type { Schemas } from "@puzzlequest/api-client";
import { api, dataOrThrow } from "../../../api";
import { entrantLabel } from "../../../quests/entrants";
import { QUEST_COMPLETED, QUEST_NOT_STARTED } from "../../../quests/status";

export type Quest = Schemas["Quest"];

/** A team or player playing the quest, as the editor holds it. */
export interface EntrantValues {
  kind: "user" | "team";
  /** The user name or team name. */
  name: string;
  /** What to call it on screen, such as "The Reds (team)". */
  label: string;
  /**
   * Whether its entry has started, so it can't be removed until the entry is
   * reset.
   */
  started: boolean;
}

/** One of the quest's stops, as the editor holds it. */
export interface StopValues {
  puzzleName: string;
  displayName: string;
  /** Missing for a puzzle just added: it gets one when the quest is saved. */
  activationCode?: string;
  /**
   * The word or phrase on the stop's QR card, for the cards' mini-game; empty
   * for none.
   */
  cardWord: string;
}

/** What the quest editor asks. */
export interface QuestFormValues {
  /**
   * The quest's name, which is in its address. Not "name": a form's elements
   * become properties of the form, and one called name would hide form.name.
   */
  questName: string;
  displayName: string;
  /** Whether only its players, staff, and those given a link can follow it. */
  isPrivate: boolean;
  /** The teams and players playing it, in order; at least one. */
  entrants: EntrantValues[];
  stops: StopValues[];
}

/**
 * The editor's starting values.
 * @param quest the quest to edit, or undefined for a new one
 * @returns the form's values
 */
export function formValuesOf(quest?: Quest): QuestFormValues {
  return {
    questName: quest?.name ?? "",
    displayName: quest?.displayName ?? "",
    isPrivate: quest?.visibility === "private",
    // A deleted team or player has no name to send, so it can't stay.
    entrants:
      quest?.entries.flatMap(({ entrant, status }) =>
        entrant.name === undefined
          ? []
          : [
              {
                kind: entrant.kind,
                name: entrant.name,
                label: entrantLabel(entrant),
                started: status !== QUEST_NOT_STARTED,
              },
            ]
      ) ?? [],
    stops:
      stopsOf(quest).map((puzzle) => ({
        puzzleName: puzzle.puzzleName,
        displayName: puzzle.displayName ?? puzzle.puzzleName,
        activationCode: puzzle.activationCode,
        cardWord: puzzle.cardWord ?? "",
      })) ?? [],
  };
}

/**
 * The quest's stops, in order. Every entry plays the same stops, so any
 * entry's list of puzzles gives them, with their activation codes.
 * @param quest the quest as stored, if it exists
 * @returns its stops
 */
export function stopsOf(
  quest: Quest | undefined
): Quest["entries"][number]["puzzles"] {
  return quest?.entries[0]?.puzzles ?? [];
}

/**
 * How many stops at the start can't change: those any entry has reached,
 * since each reaches them in order. A completed entry stops the quest
 * changing at all until it's reset; that's checked separately.
 * @param quest the quest as stored, if it exists
 * @returns the number of fixed stops
 */
export function reachedCount(quest: Quest | undefined): number {
  return Math.max(
    0,
    ...(quest?.entries ?? []).map((entry) =>
      entry.status === QUEST_NOT_STARTED
        ? 0
        : entry.puzzles.filter((puzzle) => puzzle.status !== 0).length
    )
  );
}

/**
 * Whether the quest's puzzles are locked: once any entry has completed it,
 * they can't change until that entry is reset.
 * @param quest the quest as stored, if it exists
 * @returns true if so
 */
export function isCompleted(quest: Quest | undefined): boolean {
  return (quest?.entries ?? []).some(
    (entry) => entry.status === QUEST_COMPLETED
  );
}

/**
 * Says which form field a problem the API reported is about.
 * @param field the request body's field, such as name or puzzles.0.puzzleName
 * @returns the form's field
 */
export function formFieldOf(field: string): keyof QuestFormValues {
  if (field === "name") {
    return "questName";
  }
  if (field === "visibility") {
    return "isPrivate";
  }
  if (field.startsWith("entrants")) {
    return "entrants";
  }
  if (field.startsWith("puzzles")) {
    return "stops";
  }
  return field as keyof QuestFormValues;
}

/**
 * Saves a quest. Activation codes aren't sent, so each stop keeps its own and a
 * new one gets one. Card words are always sent: an empty one removes it.
 * @param values what the editor holds
 * @param existing the quest as stored, when editing one
 * @returns the quest's name
 */
export async function saveQuest(
  values: QuestFormValues,
  existing: Quest | undefined
): Promise<string> {
  const entrants = values.entrants.map(({ kind, name }) => ({ kind, name }));
  const puzzles = values.stops.map(({ puzzleName, cardWord }) => ({
    puzzleName,
    cardWord: cardWord.trim(),
  }));
  const visibility = values.isPrivate ? "private" : "public";
  if (existing) {
    dataOrThrow(
      await api.PATCH("/quests/{name}", {
        params: { path: { name: existing.name } },
        body: {
          displayName: values.displayName,
          visibility,
          entrants,
          puzzles,
        },
      })
    );
    return existing.name;
  }
  const name = values.questName.trim();
  dataOrThrow(
    await api.POST("/quests", {
      body: {
        name,
        displayName: values.displayName,
        visibility,
        entrants,
        puzzles,
      },
    })
  );
  return name;
}
