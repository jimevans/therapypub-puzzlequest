import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ErrorPage } from "./ErrorPage";
import { routes } from "./routes";

vi.mock("../screens/webCheck/WebCheck", () => ({
  WebCheck: () => <h1>The screen</h1>,
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
  it("load a page's screen, in the page's frame", async () => {
    renderAt("/web-check");

    expect(
      await screen.findByRole("heading", { name: "The screen" })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "PuzzleQuest" })).toBeVisible();
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

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole("heading", { name: "Something went wrong" })
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This page couldn't be shown."
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    vi.restoreAllMocks();
  });
});
