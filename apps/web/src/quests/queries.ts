import { queryOptions } from "@tanstack/react-query";
import { api, dataOrThrow } from "../api";
import { questQueryKey } from "../live/useLiveQuest";

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
        })
      ),
  });
}

/**
 * Says how to fetch what the public may see of a puzzle.
 * @param name the quest's name
 * @param puzzleName the puzzle's name
 * @returns the options for TanStack Query
 */
export function spectatorPuzzleQuery(name: string, puzzleName: string) {
  return queryOptions({
    queryKey: [...questQueryKey(name), "spectator", puzzleName],
    staleTime: JUST_FETCHED_MS,
    queryFn: async () =>
      dataOrThrow(
        await api.GET("/quests/{name}/puzzles/{puzzleName}/spectator-view", {
          params: { path: { name, puzzleName } },
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
