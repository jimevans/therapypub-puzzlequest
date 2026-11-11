import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { aUser, ok, refusal, withOneEntry } from "../../test/fakes";
import { AdminLayout } from "./AdminLayout";
import { PuzzlesList } from "./PuzzlesList";
import { QuestsList } from "./QuestsList";
import { TeamsList } from "./TeamsList";
import { UsersList } from "./UsersList";

const QUEST = withOneEntry(
  {
    name: "trail",
    displayName: "The Trail",
    status: 1,
    statusDescription: "In progress",
    paused: false,
    puzzles: [],
    progress: {
      running: false,
      elapsedMs: 0,
      penaltyMs: 0,
      totalMs: 0,
      puzzles: [],
    },
  },
  { kind: "team", name: "red", displayName: "The Reds" }
);
const [ENTRY] = QUEST.entries;
const ORPHAN = {
  ...QUEST,
  name: "orphan",
  displayName: "The Orphan",
  entries: [{ ...ENTRY, entrant: { kind: "user" } }],
};
const PUZZLE = {
  name: "riddle",
  displayName: "The Riddle",
  type: 1,
  text: "",
  solutionKeyword: "x",
  solutionDisplayText: "X",
  hints: [{ text: "h", solutionWarning: false, timePenalty: 1 }],
};
const BOSS = aUser({
  id: "2",
  userName: "boss",
  displayName: "The Boss",
  email: "boss@example.com",
  authorizationLevel: 10,
});
const PLAYER = aUser();
const TEAM = {
  teamName: "red",
  displayName: "The Reds",
  joinCode: "secret",
  members: [{ userName: "player", displayName: "The Player" }],
};

/** Has the API answer with these lists, and whoever's signed in. */
function apiLists(lists: Record<string, unknown[]>) {
  return vi.spyOn(api, "GET").mockImplementation((async (path: string) => {
    if (path === "/sessions/current") {
      return ok({ user: BOSS });
    }
    return ok({ items: lists[path] ?? [], next: null });
  }) as never);
}

function show(element: React.ReactNode, path = "/") {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the admin layout", () => {
  it("links the lists, marking the current one", () => {
    vi.spyOn(api, "GET").mockResolvedValue(ok({ user: BOSS }) as never);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/puzzles"]}>
          <Routes>
            <Route element={<AdminLayout />}>
              <Route path="/puzzles" element={<h1>Listed</h1>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const nav = within(
      screen.getByRole("navigation", { name: "Administration" })
    );
    expect(nav.getByRole("link", { name: "Puzzles" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(nav.getByRole("link", { name: "Quests" })).toHaveAttribute(
      "href",
      "/quests"
    );
    expect(screen.getByRole("heading", { name: "Listed" })).toBeVisible();
  });
});

describe("the quests list", () => {
  it("shows each quest, who plays it, and its status", async () => {
    apiLists({ "/quests": [QUEST] });
    show(<QuestsList />);

    expect(
      await screen.findByRole("link", { name: "The Trail" })
    ).toHaveAttribute("href", "/quest/trail");
    expect(screen.getByText("The Reds")).toBeVisible();
    expect(screen.getByText("In progress")).toBeVisible();
  });

  it("names a race's entrants, or counts them if there are many", async () => {
    const entrant = (n: number) => ({
      ...ENTRY,
      id: `entry-${n}`,
      entrant: { kind: "team", name: `team${n}`, displayName: `Team ${n}` },
    });
    apiLists({
      "/quests": [
        {
          ...QUEST,
          entries: [
            entrant(1),
            {
              ...entrant(2),
              status: 2,
              statusDescription: "Completed",
            },
          ],
        },
        {
          ...QUEST,
          name: "big",
          displayName: "The Big Race",
          entries: [1, 2, 3, 4].map(entrant),
        },
      ],
    });
    show(<QuestsList />);

    const race = (
      await screen.findByRole("link", { name: "The Trail" })
    ).closest("tr") as HTMLElement;
    expect(race).toHaveTextContent("Team 1, Team 2");
    expect(race).toHaveTextContent("1 In progress; 1 Completed");
    expect(
      screen.getByRole("link", { name: "The Big Race" }).closest("tr")
    ).toHaveTextContent("4 entrants");
  });

  it("says when who plays it has been deleted", async () => {
    apiLists({ "/quests": [ORPHAN] });
    show(<QuestsList />);

    expect(await screen.findByText("A deleted player")).toBeVisible();
  });

  it("gets every page", async () => {
    vi.spyOn(api, "GET")
      .mockResolvedValueOnce(ok({ items: [QUEST], next: "more" }) as never)
      .mockResolvedValueOnce(ok({ items: [ORPHAN], next: null }) as never);
    show(<QuestsList />);

    expect(
      await screen.findByRole("link", { name: "The Orphan" })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "The Trail" })).toBeVisible();
    expect(api.GET).toHaveBeenLastCalledWith("/quests", {
      params: { query: { after: "more" } },
    });
  });

  it("offers a new quest", async () => {
    apiLists({});
    show(<QuestsList />);

    expect(await screen.findByText("There are no quests yet.")).toBeVisible();
    expect(screen.getByRole("link", { name: "New quest" })).toHaveAttribute(
      "href",
      "/quest/new"
    );
  });

  it("says when it can't load", async () => {
    vi.spyOn(api, "GET").mockRejectedValue(new TypeError("Failed to fetch"));
    show(<QuestsList />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach the server"
    );
  });

  describe("deleting", () => {
    it("asks in the page first, saying what it means", async () => {
      apiLists({ "/quests": [QUEST] });
      const del = vi
        .spyOn(api, "DELETE")
        .mockResolvedValue(ok(undefined, 204) as never);
      const confirm = vi.spyOn(window, "confirm");
      show(<QuestsList />);

      await userEvent.click(
        await screen.findByRole("button", { name: "Delete The Trail" })
      );

      expect(
        screen.getByRole("heading", { name: "Delete The Trail?" })
      ).toBeVisible();
      expect(screen.getByText(/Its players lose it at once/)).toBeVisible();
      expect(del).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
    });

    it("does nothing if kept", async () => {
      apiLists({ "/quests": [QUEST] });
      const del = vi.spyOn(api, "DELETE");
      show(<QuestsList />);

      await userEvent.click(
        await screen.findByRole("button", { name: "Delete The Trail" })
      );
      await userEvent.click(screen.getByRole("button", { name: "Keep it" }));

      expect(del).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("heading", { name: "Delete The Trail?" })
      ).not.toBeInTheDocument();
    });

    it("deletes once confirmed, and refreshes the list", async () => {
      const get = apiLists({ "/quests": [QUEST] });
      const del = vi
        .spyOn(api, "DELETE")
        .mockResolvedValue(ok(undefined, 204) as never);
      show(<QuestsList />);

      await userEvent.click(
        await screen.findByRole("button", { name: "Delete The Trail" })
      );
      const listFetches = get.mock.calls.length;
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() =>
        expect(del).toHaveBeenCalledWith("/quests/{name}", {
          params: { path: { name: "trail" } },
        })
      );
      await waitFor(() =>
        expect(get.mock.calls.length).toBeGreaterThan(listFetches)
      );
    });
  });
});

describe("the puzzles list", () => {
  it("shows each puzzle's type and hints", async () => {
    apiLists({ "/puzzles": [PUZZLE] });
    show(<PuzzlesList />);

    expect(
      await screen.findByRole("link", { name: "The Riddle" })
    ).toHaveAttribute("href", "/puzzle/riddle");
    expect(screen.getByText("Image")).toBeVisible();
  });

  it("says why a puzzle a quest uses can't be deleted", async () => {
    apiLists({ "/puzzles": [PUZZLE] });
    vi.spyOn(api, "DELETE").mockResolvedValue(
      refusal("in-use", "A quest uses this puzzle") as never
    );
    show(<PuzzlesList />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete The Riddle" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A quest uses this puzzle"
    );
  });
});

describe("the users list", () => {
  it("links to each user, and offers a new one", async () => {
    apiLists({ "/users": [PLAYER] });
    show(<UsersList />);

    expect(await screen.findByRole("link", { name: "player" })).toHaveAttribute(
      "href",
      "/user/player"
    );
    expect(screen.getByRole("link", { name: "New user" })).toHaveAttribute(
      "href",
      "/user/register"
    );
  });

  it("says what deleting someone means for their quests", async () => {
    apiLists({ "/users": [PLAYER] });
    show(<UsersList />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete player" })
    );

    expect(screen.getByText(/assigned to a deleted user/)).toBeVisible();
  });

  it("doesn't offer administrators deleting themselves", async () => {
    apiLists({ "/users": [BOSS, PLAYER] });
    show(<UsersList />);

    await screen.findByRole("button", { name: "Delete player" });
    expect(
      screen.queryByRole("button", { name: "Delete boss" })
    ).not.toBeInTheDocument();
  });
});

describe("the teams list", () => {
  it("shows each team's join code and members", async () => {
    apiLists({ "/teams": [TEAM] });
    show(<TeamsList />);

    expect(await screen.findByText("The Reds")).toBeVisible();
    expect(screen.getByText("secret")).toBeVisible();
    expect(screen.getByText("The Player")).toBeVisible();
  });

  it("creates a team in the page", async () => {
    apiLists({});
    const post = vi
      .spyOn(api, "POST")
      .mockResolvedValue(ok(TEAM, 201) as never);
    show(<TeamsList />);

    await userEvent.click(
      await screen.findByRole("button", { name: "New team" })
    );
    await userEvent.type(screen.getByLabelText("Team name"), "red");
    await userEvent.type(screen.getByLabelText("Display name"), "The Reds");
    await userEvent.type(screen.getByLabelText("Join code"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/teams", {
        body: { teamName: "red", displayName: "The Reds", joinCode: "secret" },
      })
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Team name")).not.toBeInTheDocument()
    );
  });

  it("edits a team, keeping its name", async () => {
    apiLists({ "/teams": [TEAM] });
    const patch = vi.spyOn(api, "PATCH").mockResolvedValue(ok(TEAM) as never);
    show(<TeamsList />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit The Reds" })
    );
    expect(screen.queryByLabelText("Team name")).not.toBeInTheDocument();
    const code = screen.getByLabelText("Join code");
    expect(code).toHaveValue("secret");
    await userEvent.clear(code);
    await userEvent.type(code, "new-code");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/teams/{teamName}", {
        params: { path: { teamName: "red" } },
        body: { displayName: "The Reds", joinCode: "new-code" },
      })
    );
  });

  it("asks for what's missing rather than sending it", async () => {
    apiLists({});
    const post = vi.spyOn(api, "POST");
    show(<TeamsList />);

    await userEvent.click(
      await screen.findByRole("button", { name: "New team" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter a team name")).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it("stays open, saying why, when refused", async () => {
    apiLists({ "/teams": [TEAM] });
    vi.spyOn(api, "PATCH").mockResolvedValue(
      refusal("already-exists", "That join code is already in use") as never
    );
    show(<TeamsList />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit The Reds" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That join code is already in use"
    );
    expect(screen.getByLabelText("Join code")).toBeVisible();
  });

  it("shows a field's problem beside it", async () => {
    apiLists({ "/teams": [TEAM] });
    vi.spyOn(api, "PATCH").mockResolvedValue(
      refusal("invalid-request", "Invalid", [
        { path: "body.joinCode", message: "Too short" },
      ]) as never
    );
    show(<TeamsList />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit The Reds" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Too short")).toBeVisible();
  });

  it("adds and removes members on saving, with the team's join code", async () => {
    apiLists({ "/teams": [TEAM], "/users": [BOSS, PLAYER] });
    vi.spyOn(api, "PATCH").mockResolvedValue(ok(TEAM) as never);
    const put = vi
      .spyOn(api, "PUT")
      .mockResolvedValue(ok(undefined, 204) as never);
    const del = vi
      .spyOn(api, "DELETE")
      .mockResolvedValue(ok(undefined, 204) as never);
    show(<TeamsList />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit The Reds" })
    );
    const members = within(screen.getByRole("group", { name: "Members" }));
    // The player already on the team isn't offered.
    await waitFor(() =>
      expect(
        members.getByRole("option", { name: "The Boss (boss)" })
      ).toBeInTheDocument()
    );
    expect(
      members.queryByRole("option", { name: /The Player/ })
    ).not.toBeInTheDocument();
    await userEvent.click(
      members.getByRole("button", { name: "Remove The Player" })
    );
    await userEvent.selectOptions(
      members.getByLabelText("Add a player"),
      "boss"
    );
    await userEvent.click(members.getByRole("button", { name: "Add" }));
    expect(put).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.queryByLabelText("Join code")).not.toBeInTheDocument()
    );
    expect(put).toHaveBeenCalledWith("/teams/{teamName}/members/{userName}", {
      params: { path: { teamName: "red", userName: "boss" } },
      body: { joinCode: "secret" },
    });
    expect(del).toHaveBeenCalledWith("/teams/{teamName}/members/{userName}", {
      params: { path: { teamName: "red", userName: "player" } },
    });
  });

  it("adds members to a new team once it exists", async () => {
    apiLists({ "/users": [PLAYER] });
    const post = vi
      .spyOn(api, "POST")
      .mockResolvedValue(ok(TEAM, 201) as never);
    const put = vi
      .spyOn(api, "PUT")
      .mockResolvedValue(ok(undefined, 204) as never);
    show(<TeamsList />);

    await userEvent.click(
      await screen.findByRole("button", { name: "New team" })
    );
    await userEvent.type(screen.getByLabelText("Team name"), "red");
    await userEvent.type(screen.getByLabelText("Display name"), "The Reds");
    await userEvent.type(screen.getByLabelText("Join code"), "secret");
    await screen.findByRole("option", { name: "The Player (player)" });
    await userEvent.selectOptions(
      screen.getByLabelText("Add a player"),
      "player"
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(post.mock.invocationCallOrder[0]).toBeLessThan(
      put.mock.invocationCallOrder[0]!
    );
    expect(put).toHaveBeenCalledWith("/teams/{teamName}/members/{userName}", {
      params: { path: { teamName: "red", userName: "player" } },
      body: { joinCode: "secret" },
    });
  });

  it("stays open, saying which member changes didn't happen", async () => {
    apiLists({ "/teams": [TEAM], "/users": [BOSS, PLAYER] });
    vi.spyOn(api, "PATCH").mockResolvedValue(ok(TEAM) as never);
    vi.spyOn(api, "PUT").mockResolvedValue(
      refusal("not-found", "No user named boss") as never
    );
    vi.spyOn(api, "DELETE").mockResolvedValue(
      // Already gone, which is what removing them was for.
      refusal("not-found", "Not a member") as never
    );
    show(<TeamsList />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit The Reds" })
    );
    await screen.findByRole("option", { name: "The Boss (boss)" });
    await userEvent.click(
      screen.getByRole("button", { name: "Remove The Player" })
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Add a player"),
      "boss"
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "The team was saved, but not every change to its members: Adding The Boss: No user named boss."
    );
    expect(alert).not.toHaveTextContent("Removing");
    expect(screen.getByLabelText("Join code")).toBeVisible();
  });

  it("takes a member already added as done", async () => {
    apiLists({ "/teams": [TEAM], "/users": [BOSS, PLAYER] });
    vi.spyOn(api, "PATCH").mockResolvedValue(ok(TEAM) as never);
    vi.spyOn(api, "PUT").mockResolvedValue(
      refusal("already-exists", "Already a member") as never
    );
    show(<TeamsList />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit The Reds" })
    );
    await screen.findByRole("option", { name: "The Boss (boss)" });
    await userEvent.selectOptions(
      screen.getByLabelText("Add a player"),
      "boss"
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.queryByLabelText("Join code")).not.toBeInTheDocument()
    );
  });

  it("closes on cancelling", async () => {
    apiLists({ "/teams": [TEAM] });
    show(<TeamsList />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit The Reds" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Join code")).not.toBeInTheDocument();
  });

  it("says what deleting a team means for its quests", async () => {
    apiLists({ "/teams": [TEAM] });
    show(<TeamsList />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete The Reds" })
    );

    expect(screen.getByText(/assigned to a deleted team/)).toBeVisible();
  });
});
