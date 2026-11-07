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
export function isAdministrator(user?: {
  authorizationLevel: number;
}): boolean {
  return (user?.authorizationLevel ?? 0) >= 10;
}
