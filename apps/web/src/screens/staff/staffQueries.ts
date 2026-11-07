import { queryOptions } from "@tanstack/react-query";
import { api, dataOrThrow } from "../../api";
import { fetchAllPages } from "../../fetchAllPages";
import { questQueryKey } from "../../live/useLiveQuest";

/** Starting or resetting a quest sends no live update, so the list refreshes. */
const REFRESH_MS = 30_000;

/** Every quest, as staff see them. */
export const staffQuestsQuery = queryOptions({
  queryKey: ["staff", "quests"],
  refetchInterval: REFRESH_MS,
  queryFn: () =>
    fetchAllPages(async (after) =>
      dataOrThrow(
        await api.GET("/staff/quests", { params: { query: { after } } })
      )
    ),
});

/**
 * A quest as staff see it. Its key starts with the quest's, so live updates
 * fetch it again.
 * @param name the quest's name
 * @returns the options for TanStack Query
 */
export function staffQuestQuery(name: string) {
  return queryOptions({
    queryKey: [...questQueryKey(name), "staff"],
    queryFn: async () =>
      dataOrThrow(
        await api.GET("/quests/{name}/staff-view", {
          params: { path: { name } },
        })
      ),
  });
}
