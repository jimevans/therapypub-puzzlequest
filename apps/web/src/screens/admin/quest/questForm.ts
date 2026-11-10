import type { Schemas } from "@puzzlequest/api-client";
import { api, dataOrThrow } from "../../../api";
import { QUEST_COMPLETED, QUEST_NOT_STARTED } from "../../../quests/status";

export type Quest = Schemas["Quest"];

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
  /** Who it's for, as "user:name" or "team:name", or "" until chosen. */
  assignee: string;
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
    assignee:
      quest?.assignee.name !== undefined
        ? `${quest.assignee.kind}:${quest.assignee.name}`
        : "",
    stops:
      quest?.puzzles.map((puzzle) => ({
        puzzleName: puzzle.puzzleName,
        displayName: puzzle.displayName ?? puzzle.puzzleName,
        activationCode: puzzle.activationCode,
        cardWord: puzzle.cardWord ?? "",
      })) ?? [],
  };
}

/**
 * How many stops at the start can't change: those the players have reached,
 * since they reach them in order. A completed quest can't change at all until
 * it's reset; that's checked separately.
 * @param quest the quest as stored, if it exists
 * @returns the number of fixed stops
 */
export function reachedCount(quest: Quest | undefined): number {
  if (!quest || quest.status === QUEST_NOT_STARTED) {
    return 0;
  }
  return quest.puzzles.filter((puzzle) => puzzle.status !== 0).length;
}

/**
 * Whether the quest's puzzles are locked: a completed quest's can't change
 * until it's reset.
 * @param quest the quest as stored, if it exists
 * @returns true if so
 */
export function isCompleted(quest: Quest | undefined): boolean {
  return quest?.status === QUEST_COMPLETED;
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
  if (field.startsWith("assignee")) {
    return "assignee";
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
  const [kind, ...rest] = values.assignee.split(":");
  const assignee = { kind: kind as "user" | "team", name: rest.join(":") };
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
          assignee,
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
        assignee,
        puzzles,
      },
    })
  );
  return name;
}
