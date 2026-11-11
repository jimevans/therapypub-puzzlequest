import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { ErrorPage } from "./ErrorPage";
import { createRoutes, patchAdminRoutes } from "./routes";
import { aUser, ok, refusal, signedOut } from "../test/fakes";

vi.mock("../screens/signIn/SignIn", () => ({
  SignIn: () => <h1>The screen</h1>,
}));

vi.mock("../screens/home/Home", () => ({
  Home: () => <h1>The home screen</h1>,
}));

vi.mock("../screens/quest/QuestScreen", () => ({
  QuestScreen: () => <h1>The quest screen</h1>,
}));

vi.mock("../screens/questConsole/QuestConsole", () => ({
  default: () => <h1>The quest console</h1>,
}));

vi.mock("../screens/admin/puzzle/PuzzleDetails", () => ({
  PuzzleDetails: () => <h1>Puzzle details</h1>,
}));

vi.mock("../screens/staff/StaffQuest", () => ({
  default: () => <h1>The staff view</h1>,
}));

vi.mock("../screens/admin/quest/QuestEditor", () => ({
  QuestEditor: () => <h1>Quest editor</h1>,
}));

vi.mock("../screens/admin/puzzle/PuzzleEditor", () => ({
  PuzzleEditor: () => <h1>Puzzle editor</h1>,
}));

vi.mock("../screens/puzzle/PuzzleScreen", () => ({
  PuzzleScreen: () => <h1>The puzzle screen</h1>,
}));

vi.mock("../screens/followAlong/FollowQuest", () => ({
  FollowQuest: () => <h1>Following a quest</h1>,
}));

vi.mock("../screens/followAlong/FollowPuzzle", () => ({
  FollowPuzzle: () => <h1>Following a puzzle</h1>,
}));

vi.mock("../screens/followAlong/Board", () => ({
  Board: () => <h1>The board</h1>,
}));

vi.mock("../screens/account/ForgotPassword", () => ({
  ForgotPassword: () => <h1>Forgot</h1>,
}));

vi.mock("../screens/account/ResetPassword", () => ({
  ResetPassword: () => <h1>Reset</h1>,
}));

vi.mock("../screens/account/VerifyEmail", () => ({
  VerifyEmail: () => <h1>Verify</h1>,
}));

vi.mock("../screens/account/SignUp", () => ({
  SignUp: () => <h1>Sign-up</h1>,
}));

vi.mock("../screens/account/Profile", () => ({
  Profile: () => <h1>Profile</h1>,
}));

vi.mock("../screens/account/EditProfile", () => ({
  EditProfile: () => <h1>Edit</h1>,
}));

vi.mock("../screens/admin/QuestsList", () => ({
  QuestsList: () => <h1>Quests list</h1>,
}));

vi.mock("../screens/admin/PuzzlesList", () => ({
  PuzzlesList: () => <h1>Puzzles list</h1>,
}));

vi.mock("../screens/admin/UsersList", () => ({
  UsersList: () => <h1>Users list</h1>,
}));

vi.mock("../screens/admin/TeamsList", () => ({
  TeamsList: () => <h1>Teams list</h1>,
}));

function renderAt(path: string) {
  const client = new QueryClient();
  const router = createMemoryRouter(createRoutes(client), {
    initialEntries: [path],
    patchRoutesOnNavigation: patchAdminRoutes,
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

describe("the routes", () => {
  beforeEach(() => {
    // Nobody's signed in: the public spectator views find nothing, and
    // everything else needs signing in.
    vi.spyOn(api, "GET").mockImplementation((async (path: string) =>
      path.endsWith("/spectator-view")
        ? refusal("not-found", "No such quest")
        : signedOut()) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("load a page's screen, in the page's frame", async () => {
    renderAt("/login");

    expect(
      await screen.findByRole("heading", { name: "The screen" })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "PuzzleQuest" })).toBeVisible();
  });

  it.each([
    ["/", "The home screen"],
    ["/quest/trail", "The quest screen"],
    ["/quest/trail/puzzle/riddle", "The puzzle screen"],
    ["/monitor/quest/trail", "Following a quest"],
    ["/monitor/quest/trail/puzzle/riddle", "Following a puzzle"],
    ["/monitor/quest/trail/board", "The board"],
    ["/user/password/forgot", "Forgot"],
    ["/user/register", "Sign-up"],
    ["/quests", "Quests list"],
    ["/puzzles", "Puzzles list"],
    ["/users", "Users list"],
    ["/teams", "Teams list"],
    ["/puzzle/new", "Puzzle editor"],
    ["/puzzle/riddle", "Puzzle details"],
    ["/puzzle/riddle/edit", "Puzzle editor"],
    ["/quest/new", "Quest editor"],
    ["/quest/trail/edit", "Quest editor"],
    ["/user/player", "Profile"],
    ["/user/player/edit", "Edit"],
    ["/user/password/reset?token=abc", "Reset"],
    ["/user/email/verify?token=abc", "Verify"],
  ])("show the screen for %s", async (path, name) => {
    renderAt(path);

    expect(await screen.findByRole("heading", { name })).toBeVisible();
  });

  it.each([
    ["/quest/trail", "/quests/{questName}", { questName: "trail" }],
    [
      "/quest/trail/puzzle/riddle",
      "/quests/{questName}/puzzles/{puzzleName}",
      { questName: "trail", puzzleName: "riddle" },
    ],
    [
      "/monitor/quest/trail",
      "/quests/{questName}/spectator-view",
      { questName: "trail" },
    ],
  ])("start fetching %s's data at once", async (path, apiPath, params) => {
    renderAt(path);

    await waitFor(() =>
      expect(api.GET).toHaveBeenCalledWith(apiPath, {
        params: { path: params },
      })
    );
  });

  it("start fetching a followed puzzle's data at once, for the entry asked", async () => {
    renderAt("/monitor/quest/trail/puzzle/riddle?entry=entry-1");

    await waitFor(() =>
      expect(api.GET).toHaveBeenCalledWith(
        "/quests/{questName}/puzzles/{puzzleName}/spectator-view",
        {
          params: {
            path: { questName: "trail", puzzleName: "riddle" },
            query: { entryId: "entry-1" },
          },
        }
      )
    );
  });

  it("add the administrators' screens only once", async () => {
    const router = renderAt("/puzzle/riddle");
    await screen.findByRole("heading", { name: "Puzzle details" });
    const routeCount = router.routes.length;

    await act(() => router.navigate("/puzzle/cipher"));
    await act(() => router.navigate("/quest/new"));

    expect(
      await screen.findByRole("heading", { name: "Quest editor" })
    ).toBeVisible();
    expect(router.routes).toHaveLength(routeCount);
  });

  it("show an administrator the console at a quest's address", async () => {
    vi.mocked(api.GET).mockImplementation((async (path: string) =>
      path === "/sessions/current"
        ? ok({ user: aUser({ userName: "boss", role: "admin" }) })
        : refusal("not-found", "No such quest")) as never);
    renderAt("/quest/trail");

    expect(
      await screen.findByRole("heading", { name: "The quest console" })
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "The quest screen" })
    ).not.toBeInTheDocument();
  });

  it("show staff their view at a quest's address", async () => {
    vi.mocked(api.GET).mockImplementation((async (path: string) =>
      path === "/sessions/current"
        ? ok({ user: aUser({ userName: "helper", role: "staff" }) })
        : refusal("not-found", "No such quest")) as never);
    renderAt("/quest/trail");

    expect(
      await screen.findByRole("heading", { name: "The staff view" })
    ).toBeVisible();
  });

  it("show the board without the frame of the other pages", async () => {
    renderAt("/monitor/quest/trail/board");

    await screen.findByRole("heading", { name: "The board" });
    expect(
      screen.queryByRole("link", { name: "PuzzleQuest" })
    ).not.toBeInTheDocument();
  });

  it("say so at an address with no page", async () => {
    renderAt("/no-such-page");

    expect(
      await screen.findByRole("heading", { name: "Page not found" })
    ).toBeVisible();
  });

  it("offer to try again when a screen fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const router = createMemoryRouter(
      [
        {
          path: "/",
          errorElement: <ErrorPage />,
          Component: () => {
            throw new Error("Broken");
          },
        },
      ],
      { initialEntries: ["/"] }
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );

    expect(
      await screen.findByRole("heading", { name: "Something went wrong" })
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This page couldn't be shown."
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
