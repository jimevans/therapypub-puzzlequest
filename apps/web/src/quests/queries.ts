import { queryOptions } from "@tanstack/react-query";
import { api, dataOrThrow } from "../api";
import { questQueryKey } from "../live/useLiveQuest";
import { shareLinkRequest } from "./shareLink";

/**
 * How long fetched data counts as new. It's just enough that a screen doesn't
 * fetch again what its route has only now fetched; live updates and the regular
 * refresh mark data out of date regardless.
 */
const JUST_FETCHED_MS = 2000;

/**
 * Says how to fetch a quest.
 * @param name the quest's name
 * @returns the options for TanStack Query
 */
export function questQuery(name: string) {
  return queryOptions({
    queryKey: questQueryKey(name),
    staleTime: JUST_FETCHED_MS,
    queryFn: async () =>
      dataOrThrow(
        await api.GET("/quests/{name}", { params: { path: { name } } })
      ),
  });
}

/**
 * Says how to fetch a quest's share links.
 * @param name the quest's name
 * @returns the options for TanStack Query
 */
export function shareLinksQuery(name: string) {
  return queryOptions({
    queryKey: [...questQueryKey(name), "share-links"],
    staleTime: JUST_FETCHED_MS,
    queryFn: async () =>
      dataOrThrow(
        await api.GET("/quests/{name}/share-links", {
          params: { path: { name } },
        })
      ),
  });
}

/**
 * Says how to fetch what the public may see of a quest.
 * @param name the quest's name
 * @returns the options for TanStack Query
 */
export function spectatorQuestQuery(name: string) {
  return queryOptions({
    queryKey: [...questQueryKey(name), "spectator"],
    staleTime: JUST_FETCHED_MS,
    queryFn: async () =>
      dataOrThrow(
        await api.GET("/quests/{name}/spectator-view", {
          params: { path: { name } },
          ...shareLinkRequest(name),
        })
      ),
  });
}

/**
 * Says how to fetch what the public may see of a puzzle, as one of the quest's
 * entries has got on with it.
 * @param name the quest's name
 * @param puzzleName the puzzle's name
 * @param entry the entry's ID, from the quest's spectator view
 * @returns the options for TanStack Query
 */
export function spectatorPuzzleQuery(
  name: string,
  puzzleName: string,
  entry: string
) {
  return queryOptions({
    queryKey: [...questQueryKey(name), "spectator", puzzleName, entry],
    staleTime: JUST_FETCHED_MS,
    queryFn: async () =>
      dataOrThrow(
        await api.GET("/quests/{name}/puzzles/{puzzleName}/spectator-view", {
          params: { path: { name, puzzleName }, query: { entry } },
          ...shareLinkRequest(name),
        })
      ),
  });
}

/**
 * Says how to fetch a puzzle as its players see it.
 * @param name the quest's name
 * @param puzzleName the puzzle's name
 * @returns the options for TanStack Query
 */
export function puzzleQuery(name: string, puzzleName: string) {
  return queryOptions({
    queryKey: [...questQueryKey(name), "puzzles", puzzleName],
    staleTime: JUST_FETCHED_MS,
    queryFn: async () =>
      dataOrThrow(
        await api.GET("/quests/{name}/puzzles/{puzzleName}", {
          params: { path: { name, puzzleName } },
        })
      ),
  });
}
