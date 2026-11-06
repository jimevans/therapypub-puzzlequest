import { Outlet, type RouteObject } from "react-router";
import { PageShell } from "../ui/PageShell";
import { ErrorPage } from "./ErrorPage";

/**
 * The React app's pages. Each loads separately, so nobody downloads a screen
 * they don't use. The server must also send the app for a page's address: see
 * apps/api/src/routes/web.ts.
 */
export const routes: RouteObject[] = [
  {
    element: (
      <PageShell>
        <Outlet />
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
        lazy: async () => ({
          Component: (await import("../screens/quest/QuestScreen")).QuestScreen,
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
