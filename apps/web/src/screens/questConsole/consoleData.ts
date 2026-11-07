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
          await api.GET("/quests/{name}/events", {
            params: { path: { name }, query: { after } },
          })
        )
      ),
  });
}

/** Something an administrator does to a running quest. */
export type QuestAction =
  | { kind: "start" | "pause" | "resume" | "reset" }
  | { kind: "skipPuzzle"; puzzleName: string }
  | { kind: "resetPuzzle"; puzzleName: string; refundHints: boolean };

/**
 * Asks the API to do an action.
 * @param name the quest's name
 * @param action what to do
 */
async function run(name: string, action: QuestAction): Promise<void> {
  const path = { name };
  switch (action.kind) {
    case "start":
      dataOrThrow(await api.POST("/quests/{name}/start", { params: { path } }));
      return;
    case "pause":
      dataOrThrow(await api.POST("/quests/{name}/pause", { params: { path } }));
      return;
    case "resume":
      dataOrThrow(
        await api.POST("/quests/{name}/resume", { params: { path } })
      );
      return;
    case "reset":
      dataOrThrow(await api.POST("/quests/{name}/reset", { params: { path } }));
      return;
    case "skipPuzzle":
      dataOrThrow(
        await api.POST("/quests/{name}/puzzles/{puzzleName}/skip", {
          params: { path: { name, puzzleName: action.puzzleName } },
        })
      );
      return;
    case "resetPuzzle":
      dataOrThrow(
        await api.POST("/quests/{name}/puzzles/{puzzleName}/reset", {
          params: { path: { name, puzzleName: action.puzzleName } },
          body: { refundHints: action.refundHints },
        })
      );
      return;
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
