import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { ErrorPage } from "./ErrorPage";
import { createRoutes } from "./routes";

vi.mock("../screens/signIn/SignIn", () => ({
  SignIn: () => <h1>The screen</h1>,
}));

vi.mock("../screens/home/Home", () => ({
  Home: () => <h1>The home screen</h1>,
}));

vi.mock("../screens/quest/QuestScreen", () => ({
  QuestScreen: () => <h1>The quest screen</h1>,
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

function renderAt(path: string) {
  const client = new QueryClient();
  const router = createMemoryRouter(createRoutes(client), {
    initialEntries: [path],
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe("the routes", () => {
  beforeEach(() => {
    vi.spyOn(api, "GET").mockResolvedValue({
      response: new Response("{}", { status: 401 }),
    } as never);
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
    ["/user/password/reset?token=abc", "Reset"],
    ["/user/email/verify?token=abc", "Verify"],
  ])("show the screen for %s", async (path, name) => {
    renderAt(path);

    expect(await screen.findByRole("heading", { name })).toBeVisible();
  });

  it.each([
    ["/quest/trail", "/quests/{name}", { name: "trail" }],
    [
      "/quest/trail/puzzle/riddle",
      "/quests/{name}/puzzles/{puzzleName}",
      { name: "trail", puzzleName: "riddle" },
    ],
    [
      "/monitor/quest/trail",
      "/quests/{name}/spectator-view",
      { name: "trail" },
    ],
    [
      "/monitor/quest/trail/puzzle/riddle",
      "/quests/{name}/puzzles/{puzzleName}/spectator-view",
      { name: "trail", puzzleName: "riddle" },
    ],
  ])("start fetching %s's data at once", async (path, apiPath, params) => {
    renderAt(path);

    await waitFor(() =>
      expect(api.GET).toHaveBeenCalledWith(apiPath, {
        params: { path: params },
      })
    );
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
