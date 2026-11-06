import { Outlet, type RouteObject } from "react-router";
import { PageShell } from "../ui/PageShell";
import { ErrorPage } from "./ErrorPage";

/**
 * The React app's pages. Each loads separately, so nobody downloads a screen
 * they don't use. A page must also be listed in apps/api/src/routes/web.ts,
 * so that the server sends the app for its address.
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
        path: "/login",
        lazy: async () => ({
          Component: (await import("../screens/signIn/SignIn")).SignIn,
        }),
      },
    ],
  },
];
