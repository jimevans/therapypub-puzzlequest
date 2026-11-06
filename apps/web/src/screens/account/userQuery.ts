import { queryOptions } from "@tanstack/react-query";
import { api, dataOrThrow } from "../../api";

/**
 * Says how to fetch a user, with their teams.
 * @param userName the user's name
 * @returns the options for TanStack Query
 */
export function userQuery(userName: string) {
  return queryOptions({
    queryKey: ["users", userName],
    queryFn: async () =>
      dataOrThrow(
        await api.GET("/users/{userName}", {
          params: { path: { userName } },
        })
      ),
  });
}
