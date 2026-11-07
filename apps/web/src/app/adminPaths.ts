// Which addresses are administrators' screens. Shared by the router, which
// loads those screens only when one is opened, and the service worker, which
// leaves them to the server so that its checks of who's asking still apply.

/** The first part of the addresses of administrators' screens. */
const ADMIN_SECTIONS = new Set([
  "quests",
  "puzzles",
  "users",
  "teams",
  "puzzle",
]);

/**
 * Says whether an address is one of the administrators' screens. The quest
 * editor's addresses share their start with a quest's page, which everyone
 * has.
 * @param path the address's path
 * @returns true if so
 */
export function isAdminPath(path: string): boolean {
  return (
    ADMIN_SECTIONS.has(path.split("/")[1] ?? "") ||
    /^\/quest\/(new|[^/]+\/edit)\/?$/.test(path)
  );
}
