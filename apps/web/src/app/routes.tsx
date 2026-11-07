import type {
  FetchQueryOptions,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query";
import {
  Outlet,
  type Params,
  type PatchRoutesOnNavigationFunction,
  type RouteObject,
  ScrollRestoration,
} from "react-router";
import {
  puzzleQuery,
  questQuery,
  spectatorPuzzleQuery,
  spectatorQuestQuery,
} from "../quests/queries";
import { PageShell } from "../ui/PageShell";
import { ErrorPage } from "./ErrorPage";

/**
 * The React app's pages. Each loads separately, so nobody downloads a screen
 * they don't use. The server must also send the app for a page's address: see
 * apps/api/src/routes/web.ts.
 */
export function createRoutes(queryClient: QueryClient): RouteObject[] {
  /**
   * Makes a loader that starts fetching a screen's data as its code starts to
   * download, rather than after, which on a phone saves a whole round trip. It
   * waits for nothing: the screen shows the outcome, as for any fetch.
   */
  const prefetch =
    <Data, Key extends QueryKey>(
      query: (params: Params) => FetchQueryOptions<Data, Error, Data, Key>
    ) =>
    ({ params }: { params: Params }) => {
      void queryClient.prefetchQuery(query(params));
      return null;
    };

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
          path: "/quest/:name/puzzle/:puzzleName",
          loader: prefetch(({ name = "", puzzleName = "" }) =>
            puzzleQuery(name, puzzleName)
          ),
          lazy: async () => ({
            Component: (await import("../screens/puzzle/PuzzleScreen"))
              .PuzzleScreen,
          }),
        },
        {
          path: "/monitor/quest/:name",
          loader: prefetch(({ name = "" }) => spectatorQuestQuery(name)),
          lazy: async () => ({
            Component: (await import("../screens/followAlong/FollowQuest"))
              .FollowQuest,
          }),
        },
        {
          path: "/monitor/quest/:name/puzzle/:puzzleName",
          loader: prefetch(({ name = "", puzzleName = "" }) =>
            spectatorPuzzleQuery(name, puzzleName)
          ),
          lazy: async () => ({
            Component: (await import("../screens/followAlong/FollowPuzzle"))
              .FollowPuzzle,
          }),
        },
        {
          path: "/user/password/forgot",
          lazy: async () => ({
            Component: (await import("../screens/account/ForgotPassword"))
              .ForgotPassword,
          }),
        },
        {
          path: "/user/password/reset",
          lazy: async () => ({
            Component: (await import("../screens/account/ResetPassword"))
              .ResetPassword,
          }),
        },
        {
          path: "/user/email/verify",
          lazy: async () => ({
            Component: (await import("../screens/account/VerifyEmail"))
              .VerifyEmail,
          }),
        },
        {
          path: "/user/register",
          lazy: async () => ({
            Component: (await import("../screens/account/SignUp")).SignUp,
          }),
        },
        {
          path: "/user/:userName",
          lazy: async () => ({
            Component: (await import("../screens/account/Profile")).Profile,
          }),
        },
        {
          path: "/user/:userName/edit",
          lazy: async () => ({
            Component: (await import("../screens/account/EditProfile"))
              .EditProfile,
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
    // A player's quest, or an administrator's console for it, which has the
    // wider frame of the administrators' screens. Which it is depends on who's
    // signed in, so the screen chooses its own frame.
    {
      path: "/quest/:name",
      loader: prefetch(({ name = "" }) => questQuery(name)),
      hydrateFallbackElement: <PageShell />,
      errorElement: <ErrorPage />,
      lazy: async () => ({
        Component: (await import("../screens/quest/QuestPage")).QuestPage,
      }),
    },
    // Fills the screen, so it's outside the frame of the other pages.
    {
      path: "/monitor/quest/:name/board",
      loader: prefetch(({ name = "" }) => spectatorQuestQuery(name)),
      hydrateFallbackElement: <PageShell />,
      errorElement: <ErrorPage />,
      lazy: async () => ({
        Component: (await import("../screens/followAlong/Board")).Board,
      }),
    },
  ];
}

/** The first part of the addresses of administrators' screens. */
const ADMIN_SECTIONS = new Set([
  "quests",
  "puzzles",
  "users",
  "teams",
  "puzzle",
]);

/**
 * Adds administrators' screens to the router when one is first opened, so that
 * nobody else downloads even the list of them. The router asks only about an
 * address none of its routes match.
 */
export const patchAdminRoutes: PatchRoutesOnNavigationFunction = async ({
  path,
  patch,
}) => {
  if (ADMIN_SECTIONS.has(path.split("/")[1] ?? "")) {
    const { adminScreens } = await import("./adminRoutes");
    patch(null, [
      {
        lazy: async () => ({
          Component: (await import("../screens/admin/AdminLayout")).AdminLayout,
        }),
        hydrateFallbackElement: <PageShell wide />,
        errorElement: <ErrorPage />,
        children: adminScreens,
      },
    ]);
  }
};
