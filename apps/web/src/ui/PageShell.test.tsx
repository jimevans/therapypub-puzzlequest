import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { aUser, ok, signedOut } from "../test/fakes";
import { PageShell } from "./PageShell";

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PageShell>The page</PageShell>
    </QueryClientProvider>
  );
}

describe("PageShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the page, with links for whoever is signed in", async () => {
    vi.spyOn(api, "GET").mockResolvedValue(
      ok({ user: aUser({ userName: "a player/1" }) }) as never
    );

    show();

    expect(screen.getByText("The page")).toBeVisible();
    expect(
      await screen.findByRole("link", { name: "Profile" })
    ).toHaveAttribute("href", "/user/a%20player%2F1");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByRole("link", { name: "Sign out" })).toHaveAttribute(
      "href",
      "/logout"
    );
  });

  it("shows no account links to a visitor who isn't signed in", async () => {
    const get = vi.spyOn(api, "GET").mockResolvedValue(signedOut() as never);

    show();

    await vi.waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "Sign out" })).toBeNull();
    expect(screen.getByRole("link", { name: "PuzzleQuest" })).toBeVisible();
  });
});
