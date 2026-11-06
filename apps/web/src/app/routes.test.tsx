import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { ErrorPage } from "./ErrorPage";
import { routes } from "./routes";

vi.mock("../screens/signIn/SignIn", () => ({
  SignIn: () => <h1>The screen</h1>,
}));

vi.mock("../screens/home/Home", () => ({
  Home: () => <h1>The home screen</h1>,
}));

vi.mock("../screens/quest/QuestScreen", () => ({
  QuestScreen: () => <h1>The quest screen</h1>,
}));

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient()}>
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
  ])("show the screen for %s", async (path, name) => {
    renderAt(path);

    expect(await screen.findByRole("heading", { name })).toBeVisible();
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
