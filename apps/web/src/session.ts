import { useQuery } from "@tanstack/react-query";
import { api, dataOrThrow } from "./api";

/**
 * Finds out who is signed in. The session cookie isn't visible to scripts, so
 * only the API can say.
 * @returns the query, whose data is the session, or null if nobody is signed in
 */
export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const result = await api.GET("/sessions/current");
      return result.response.status === 401 ? null : dataOrThrow(result);
    },
  });
}
