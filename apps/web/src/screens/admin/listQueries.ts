import { queryOptions } from "@tanstack/react-query";
import { api, dataOrThrow } from "../../api";
import { fetchAllPages } from "../../fetchAllPages";

// Everything of each kind, for the administrators' lists and for choosing
// from in the editors, which share what's been fetched.

export const allQuestsQuery = queryOptions({
  queryKey: ["quests"],
  queryFn: () =>
    fetchAllPages(async (after) =>
      dataOrThrow(await api.GET("/quests", { params: { query: { after } } }))
    ),
});

export const allPuzzlesQuery = queryOptions({
  queryKey: ["puzzles"],
  queryFn: () =>
    fetchAllPages(async (after) =>
      dataOrThrow(await api.GET("/puzzles", { params: { query: { after } } }))
    ),
});

export const allUsersQuery = queryOptions({
  queryKey: ["users"],
  queryFn: () =>
    fetchAllPages(async (after) =>
      dataOrThrow(await api.GET("/users", { params: { query: { after } } }))
    ),
});

export const allTeamsQuery = queryOptions({
  queryKey: ["teams"],
  queryFn: () =>
    fetchAllPages(async (after) =>
      dataOrThrow(await api.GET("/teams", { params: { query: { after } } }))
    ),
});
