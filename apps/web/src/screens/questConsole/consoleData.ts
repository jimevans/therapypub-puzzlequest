import type { Schemas } from "@puzzlequest/api-client";
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api, dataOrThrow } from "../../api";
import { fetchAllPages } from "../../fetchAllPages";
import { questQueryKey } from "../../live/useLiveQuest";

/**
 * What happened in a quest, oldest first. Its key starts with the quest's, so
 * live updates fetch it again.
 * @param name the quest's name
 * @returns the options for TanStack Query
 */
export function eventsQuery(name: string) {
  return queryOptions({
    queryKey: [...questQueryKey(name), "events"],
    queryFn: () =>
      fetchAllPages(async (after) =>
        dataOrThrow(
          await api.GET("/quests/{questName}/events", {
            params: { path: { questName: name }, query: { after } },
          })
        )
      ),
  });
}

/** A team or player in a quest, by name, for the actions on its entry. */
export interface EntrantRef {
  kind: Schemas["EntrantKind"];
  name: string;
}

/**
 * Something an administrator does to a running quest: to one entrant's entry,
 * or, with no entrant, to every entry.
 */
export type QuestAction = { entrant?: EntrantRef } & (
  | { kind: "start" | "pause" | "resume" | "reset" }
  | { kind: "skipPuzzle"; puzzleName: string }
  | { kind: "resetPuzzle"; puzzleName: string; refundHints: boolean }
);

/**
 * Asks the API to do an action to one team's or player's entry. Teams and
 * players have routes of their own, which the client types separately.
 * @param name the quest's name
 * @param entrant the team or player
 * @param action what to do
 */
async function runForEntrant(
  name: string,
  entrant: EntrantRef,
  action: QuestAction
): Promise<void> {
  if (entrant.kind === "team") {
    const path = { questName: name, teamName: entrant.name };
    switch (action.kind) {
      case "skipPuzzle":
        dataOrThrow(
          await api.POST(
            "/quests/{questName}/teams/{teamName}/puzzles/{puzzleName}/skip",
            { params: { path: { ...path, puzzleName: action.puzzleName } } }
          )
        );
        return;
      case "resetPuzzle":
        dataOrThrow(
          await api.POST(
            "/quests/{questName}/teams/{teamName}/puzzles/{puzzleName}/reset",
            {
              params: { path: { ...path, puzzleName: action.puzzleName } },
              body: { refundHints: action.refundHints },
            }
          )
        );
        return;
      default:
        dataOrThrow(
          await api.POST(
            `/quests/{questName}/teams/{teamName}/${action.kind}`,
            {
              params: { path },
            }
          )
        );
        return;
    }
  }
  const path = { questName: name, userName: entrant.name };
  switch (action.kind) {
    case "skipPuzzle":
      dataOrThrow(
        await api.POST(
          "/quests/{questName}/players/{userName}/puzzles/{puzzleName}/skip",
          { params: { path: { ...path, puzzleName: action.puzzleName } } }
        )
      );
      return;
    case "resetPuzzle":
      dataOrThrow(
        await api.POST(
          "/quests/{questName}/players/{userName}/puzzles/{puzzleName}/reset",
          {
            params: { path: { ...path, puzzleName: action.puzzleName } },
            body: { refundHints: action.refundHints },
          }
        )
      );
      return;
    default:
      dataOrThrow(
        await api.POST(
          `/quests/{questName}/players/{userName}/${action.kind}`,
          {
            params: { path },
          }
        )
      );
      return;
  }
}

/**
 * Asks the API to do an action.
 * @param name the quest's name
 * @param action what to do, and to whose entry
 */
async function run(name: string, action: QuestAction): Promise<void> {
  if (action.entrant) {
    await runForEntrant(name, action.entrant, action);
    return;
  }
  switch (action.kind) {
    case "skipPuzzle":
    case "resetPuzzle":
      throw new Error("A puzzle is skipped or reset for one entrant");
    default:
      dataOrThrow(
        await api.POST(`/quests/{questName}/${action.kind}`, {
          params: { path: { questName: name } },
        })
      );
  }
}

/**
 * Doing the console's actions. Afterwards everything about the quest is fetched
 * again, since starting and resetting send no live update.
 * @param name the quest's name
 * @returns the mutation
 */
export function useQuestAction(name: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: QuestAction) => run(name, action),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: questQueryKey(name) }),
  });
}
