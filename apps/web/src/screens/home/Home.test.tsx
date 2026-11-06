import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { Home } from "./Home";

const assign = vi.fn();

const PLAYER = { userName: "player one", emailVerified: true };

const CLOCK = { running: false, elapsedMs: 0, penaltyMs: 0, totalMs: 0 };

function summary(name: string, fields = {}) {
  return {
    name,
    displayName: `The ${name}`,
    status: 1,
    statusDescription: "In progress",
    paused: false,
    progress: CLOCK,
    ...fields,
  };
}

function ok(data: unknown) {
  return { data, response: new Response("{}", { status: 200 }) };
}

/** Has the API answer with the user, and each of the given pages in turn. */
function apiAnswers(user: unknown, ...pages: unknown[]) {
  const remaining = [...pages];
  return vi.spyOn(api, "GET").mockImplementation((async (path: string) => {
    if (path === "/sessions/current") {
      return user
        ? ok({ user })
        : { response: new Response("{}", { status: 401 }) };
    }
    return ok(remaining.shift());
  }) as never);
}

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Home", () => {
  beforeEach(() => {
    assign.mockClear();
    vi.stubGlobal("location", { ...location, assign });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists the player's quests, each with its status, time, and link", async () => {
    apiAnswers(PLAYER, {
      items: [
        summary("trail", {
          progress: { ...CLOCK, elapsedMs: 300_000, totalMs: 360_000 },
        }),
      ],
      next: null,
    });
    show();

    const link = await screen.findByRole("link", { name: "The trail" });
    expect(link).toHaveAttribute("href", "/quest/trail");
    expect(screen.getByText("In progress")).toBeVisible();
    expect(screen.getByText("6:00")).toBeVisible();
  });

  it("asks for the signed-in player's quests", async () => {
    const get = apiAnswers(PLAYER, { items: [], next: null });
    show();

    await screen.findByText("You have no quests yet.");
    expect(get).toHaveBeenCalledWith("/users/{userName}/quests", {
      params: { path: { userName: "player one" }, query: { after: undefined } },
    });
  });

  it("gets every page of quests", async () => {
    const get = apiAnswers(
      PLAYER,
      { items: [summary("first")], next: "cursor" },
      { items: [summary("second")], next: null }
    );
    show();

    expect(
      await screen.findByRole("link", { name: "The first" })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "The second" })).toBeVisible();
    expect(get).toHaveBeenCalledWith("/users/{userName}/quests", {
      params: { path: { userName: "player one" }, query: { after: "cursor" } },
    });
  });

  it("escapes a quest's name in its link", async () => {
    apiAnswers(PLAYER, { items: [summary("a/b c")], next: null });
    show();

    expect(
      await screen.findByRole("link", { name: "The a/b c" })
    ).toHaveAttribute("href", "/quest/a%2Fb%20c");
  });

  it("says so when it can't load the quests", async () => {
    vi.spyOn(api, "GET").mockImplementation((async (path: string) => {
      if (path === "/sessions/current") {
        return ok({ user: PLAYER });
      }
      throw new TypeError("Failed to fetch");
    }) as never);
    show();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load your quests"
    );
  });

  it("shows the landing page to anyone signed out", async () => {
    apiAnswers(null);
    show();

    expect(
      await screen.findByRole("heading", {
        name: "Welcome to the PuzzleMaster's domain",
      })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login"
    );
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/user/register"
    );
    expect(assign).not.toHaveBeenCalled();
  });

  describe("the email reminder", () => {
    function resendAnswers(status: number, body: object) {
      return vi.spyOn(api, "POST").mockResolvedValue({
        data: status < 400 ? body : undefined,
        error: status < 400 ? undefined : body,
        response: new Response("{}", { status }),
      } as never);
    }

    it("doesn't appear once the address is verified", async () => {
      apiAnswers(PLAYER, { items: [], next: null });
      show();

      await screen.findByText("You have no quests yet.");
      expect(
        screen.queryByRole("button", { name: "Send it again" })
      ).not.toBeInTheDocument();
    });

    it("sends the email again, once", async () => {
      apiAnswers(
        { ...PLAYER, emailVerified: false },
        { items: [], next: null }
      );
      const post = resendAnswers(202, {});
      show();

      const button = await screen.findByRole("button", {
        name: "Send it again",
      });
      await userEvent.click(button);

      expect(await screen.findByText("Sent. Check your inbox.")).toBeVisible();
      expect(button).toBeDisabled();
      expect(post).toHaveBeenCalledWith(
        "/users/{userName}/email-verification-requests",
        { params: { path: { userName: "player one" } } }
      );
    });

    it("says why it couldn't, and lets the player try again", async () => {
      apiAnswers(
        { ...PLAYER, emailVerified: false },
        { items: [], next: null }
      );
      resendAnswers(429, {
        title: "Too many requests",
        status: 429,
        detail: "Try again later",
      });
      show();

      const button = await screen.findByRole("button", {
        name: "Send it again",
      });
      await userEvent.click(button);

      expect(await screen.findByText("Try again later")).toBeVisible();
      expect(button).toBeEnabled();
    });
  });
});
