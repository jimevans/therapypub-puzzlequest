import type { QueryClient } from "@tanstack/react-query";
import { Outlet, type RouteObject, ScrollRestoration } from "react-router";
import { puzzleQuery, questQuery } from "../quests/queries";
import { PageShell } from "../ui/PageShell";
import { ErrorPage } from "./ErrorPage";

/**
 * The React app's pages. Each loads separately, so nobody downloads a screen
 * they don't use. The server must also send the app for a page's address: see
 * apps/api/src/routes/web.ts.
 */
export function createRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    {
      element: (
        <PageShell>
          <Outlet />
          {/* Otherwise a link keeps the old page's scroll position. */}
          <ScrollRestoration />
        </PageShell>
      ),
      // Paints the page's frame at once, while its screen downloads.
      hydrateFallbackElement: <PageShell />,
      errorElement: <ErrorPage />,
      children: [
        {
          path: "/",
          lazy: async () => ({
            Component: (await import("../screens/home/Home")).Home,
          }),
        },
        {
          path: "/quest/:name",
          // A loader starts as the screen's code does, rather than after it has
          // downloaded, which on a phone saves a whole round trip. It waits for
          // nothing: the screen shows the outcome, as it does for any fetch.
          loader: ({ params }) => {
            void queryClient.prefetchQuery(questQuery(params.name ?? ""));
            return null;
          },
          lazy: async () => ({
            Component: (await import("../screens/quest/QuestScreen"))
              .QuestScreen,
          }),
        },
        {
          path: "/quest/:name/puzzle/:puzzleName",
          loader: ({ params }) => {
            void queryClient.prefetchQuery(
              puzzleQuery(params.name ?? "", params.puzzleName ?? "")
            );
            return null;
          },
          lazy: async () => ({
            Component: (await import("../screens/puzzle/PuzzleScreen"))
              .PuzzleScreen,
          }),
        },
        {
          path: "/login",
          lazy: async () => ({
            Component: (await import("../screens/signIn/SignIn")).SignIn,
          }),
        },
      ],
    },
  ];
}
