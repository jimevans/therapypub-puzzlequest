import type { RouteObject } from "react-router";

/**
 * Administrators' screens. The router adds them, in their frame, when one is
 * first opened (see patchAdminRoutes), so players never download this list.
 * It imports nothing that the first page load has, which would split those
 * modules out of it. The server sends the app at these addresses only to
 * administrators: see apps/api/src/routes/admin.ts.
 */
export const adminScreens: RouteObject[] = [
  {
    path: "/quests",
    lazy: async () => ({
      Component: (await import("../screens/admin/QuestsList")).QuestsList,
    }),
  },
  {
    path: "/puzzles",
    lazy: async () => ({
      Component: (await import("../screens/admin/PuzzlesList")).PuzzlesList,
    }),
  },
  {
    path: "/users",
    lazy: async () => ({
      Component: (await import("../screens/admin/UsersList")).UsersList,
    }),
  },
  {
    path: "/teams",
    lazy: async () => ({
      Component: (await import("../screens/admin/TeamsList")).TeamsList,
    }),
  },
  {
    path: "/puzzle/new",
    lazy: async () => ({
      Component: (await import("../screens/admin/puzzle/PuzzleEditor"))
        .PuzzleEditor,
    }),
  },
  {
    path: "/puzzle/:name",
    lazy: async () => ({
      Component: (await import("../screens/admin/puzzle/PuzzleDetails"))
        .PuzzleDetails,
    }),
  },
  {
    path: "/puzzle/:name/edit",
    lazy: async () => ({
      Component: (await import("../screens/admin/puzzle/PuzzleEditor"))
        .PuzzleEditor,
    }),
  },
  {
    path: "/quest/new",
    lazy: async () => ({
      Component: (await import("../screens/admin/quest/QuestEditor"))
        .QuestEditor,
    }),
  },
  {
    path: "/quest/:name/edit",
    lazy: async () => ({
      Component: (await import("../screens/admin/quest/QuestEditor"))
        .QuestEditor,
    }),
  },
];
