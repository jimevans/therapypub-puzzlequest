import type { Schemas } from "@puzzlequest/api-client";
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

/** Sends the visitor to sign in, and back to this page afterwards. */
export function goToSignIn(): void {
  const here = `${location.pathname}${location.search}`;
  location.assign(`/login?next=${encodeURIComponent(here)}`);
}

/**
 * Says whether a user is an administrator.
 * @param user the user, if any
 * @returns true if so
 */
export function isAdministrator(user?: { role: Schemas["Role"] }): boolean {
  return user?.role === "admin";
}

/**
 * Says whether a user is staff: someone who follows every quest from the stops,
 * without running them. Administrators aren't counted, since they have more.
 * @param user the user, if any
 * @returns true if so
 */
export function isStaff(user?: { role: Schemas["Role"] }): boolean {
  return user?.role === "staff";
}
