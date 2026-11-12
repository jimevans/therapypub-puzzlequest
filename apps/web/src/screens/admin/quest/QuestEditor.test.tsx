import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api";
import { aUser, ok, refusal, withOneEntry } from "../../../test/fakes";
import { QuestEditor } from "./QuestEditor";

const STOPPED = {
  startTime: null,
  endTime: null,
  running: false,
  clockStart: null,
  elapsedMs: 0,
  penaltyMs: 0,
  totalMs: 0,
};

function stop(puzzleName: string, completed = false) {
  return {
    puzzleName,
    displayName: `The ${puzzleName}`,
    status: completed ? "completed" : "notReached",
    statusDescription: completed ? "Completed" : "Unavailable",
    hintsRevealed: 0,
    activationCode: `${puzzleName}-code`,
    activationTime: completed ? "2026-11-07T10:05:00.000Z" : null,
    startTime: completed ? "2026-11-07T10:00:00.000Z" : null,
    endTime: completed ? "2026-11-07T10:15:00.000Z" : null,
    skipped: false,
    hints: [],
  };
}

const QUEST = {
  questName: "trail",
  displayName: "The Trail",
  status: "notStarted",
  statusDescription: "Not yet started",
  paused: false,
  messages: [],
  challenge: null,
  puzzles: [stop("riddle"), stop("cipher"), stop("finale")],
  progress: { ...STOPPED, puzzles: [] },
};
const RUNNING = {
  ...QUEST,
  status: "inProgress",
  statusDescription: "In progress",
  puzzles: [stop("riddle", true), stop("cipher"), stop("finale")],
};
const PUZZLES = ["riddle", "cipher", "finale", "lantern", "bell"].map(
  (name) => ({
    puzzleName: name,
    displayName: `The ${name}`,
    type: "text",
    text: "",
    solutionKeyword: "x",
    solutionText: "X",
    hints: [],
  })
);

/** The quest as the API gives it, played by the Reds alone. */
const asStored = (quest: typeof QUEST) => withOneEntry(quest);

/**
 * Has the API answer with this quest, and everyone and everything.
 * @param quest the quest, with its one entry's progress beside it, or the
 *  quest as the API gives it, with its entries
 */
function apiWith(
  quest:
    | ({ questName: string; displayName: string } & Record<string, unknown>)
    | null
) {
  const stored = quest && ("entries" in quest ? quest : withOneEntry(quest));
  return vi.spyOn(api, "GET").mockImplementation((async (path: string) => {
    switch (path) {
      case "/quests/{questName}":
        return stored ? ok(stored) : refusal("not-found", "No such quest");
      case "/users":
        return ok({
          items: [aUser({ userName: "pat", displayName: "Pat" })],
          next: null,
        });
      case "/teams":
        return ok({
          items: [
            { teamName: "reds", displayName: "The Reds", members: [] },
            { teamName: "blues", displayName: "The Blues", members: [] },
          ],
          next: null,
        });
      case "/puzzles":
        return ok({ items: PUZZLES, next: null });
      default:
        return refusal("not-found", "Not here");
    }
  }) as never);
}

function show(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/quests", element: <h1>Every quest</h1> },
      { path: "/quest/new", element: <QuestEditor /> },
      { path: "/quest/:name/edit", element: <QuestEditor /> },
      { path: "/quest/:name", element: <h1>The console</h1> },
    ],
    { initialEntries: [path] }
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

/** The names of the stops, in order. */
function stopNames() {
  return within(screen.getByRole("group", { name: "Stops" }))
    .getAllByRole("listitem")
    .map((item) => within(item).getByRole("link").textContent);
}

/** The names of the entrants, in order. */
function entrantNames() {
  return within(screen.getByRole("group", { name: "Entrants" }))
    .getAllByRole("listitem")
    .map(
      (item) => item.querySelector("[data-entrant] > span + span")?.textContent
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

describe("creating a quest", () => {
  it("assigns it, picks its puzzles in order, and saves it", async () => {
    const user = userEvent.setup();
    apiWith(null);
    const post = vi
      .spyOn(api, "POST")
      .mockResolvedValue(ok(asStored(QUEST), 201) as never);
    const router = show("/quest/new");

    await user.type(await screen.findByLabelText("Name"), "trail");
    await user.type(screen.getByLabelText("Display name"), "The Trail");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "The Reds (reds)" })
      ).toBeInTheDocument()
    );
    await user.selectOptions(
      screen.getByLabelText("Add a team or player"),
      "team:reds"
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Add puzzles" }));
    const picker = screen.getByRole("dialog", { name: "Add puzzles" });
    await user.click(await within(picker).findByLabelText(/The lantern/));
    await user.type(within(picker).getByLabelText("Search"), "rid");
    expect(within(picker).queryByLabelText(/The bell/)).not.toBeInTheDocument();
    await user.click(within(picker).getByLabelText(/The riddle/));
    await user.click(
      within(picker).getByRole("button", { name: "Add 2 puzzles" })
    );
    expect(stopNames()).toEqual(["The lantern", "The riddle"]);
    expect(screen.getAllByText("Code assigned when saved")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/quest/trail")
    );
    expect(post).toHaveBeenCalledWith("/quests", {
      body: {
        questName: "trail",
        displayName: "The Trail",
        visibility: "public",
        entrants: [{ kind: "team", name: "reds" }],
        puzzles: [
          { puzzleName: "lantern", cardWord: "" },
          { puzzleName: "riddle", cardWord: "" },
        ],
      },
    });
  });

  it("says what's missing, without saving", async () => {
    const user = userEvent.setup();
    apiWith(null);
    const post = vi.spyOn(api, "POST");
    show("/quest/new");

    await user.click(await screen.findByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter a name")).toBeVisible();
    expect(screen.getByText("Enter a display name")).toBeVisible();
    expect(screen.getByText("Add a team or a player")).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the server's objection beside the field", async () => {
    const user = userEvent.setup();
    apiWith(null);
    vi.spyOn(api, "POST").mockResolvedValue(
      refusal("already-exists", "A quest named trail already exists", [
        { path: "body.questName", message: "Already taken" },
      ]) as never
    );
    show("/quest/new");

    await user.type(await screen.findByLabelText("Name"), "trail");
    await user.type(screen.getByLabelText("Display name"), "The Trail");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "Pat (pat)" })
      ).toBeInTheDocument()
    );
    await user.selectOptions(
      screen.getByLabelText("Add a team or player"),
      "player:pat"
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Already taken")).toBeVisible();
  });
});

describe("editing a quest", () => {
  it("reorders and removes stops, keeping their codes", async () => {
    const user = userEvent.setup();
    apiWith(QUEST);
    const patch = vi
      .spyOn(api, "PATCH")
      .mockResolvedValue(ok(asStored(QUEST)) as never);
    show("/quest/trail/edit");

    expect(await screen.findByText("riddle-code")).toBeVisible();
    expect(entrantNames()).toEqual(["The Reds (team)"]);
    await user.click(
      screen.getByRole("button", { name: "Move The finale up" })
    );
    expect(stopNames()).toEqual(["The riddle", "The finale", "The cipher"]);
    await user.click(screen.getByRole("button", { name: "Remove The riddle" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith("/quests/{questName}", {
      params: { path: { questName: "trail" } },
      body: {
        displayName: "The Trail",
        visibility: "public",
        entrants: [{ kind: "team", name: "reds" }],
        puzzles: [
          { puzzleName: "finale", cardWord: "" },
          { puzzleName: "cipher", cardWord: "" },
        ],
      },
    });
  });

  it("sets, keeps and clears the words on the stops' QR cards", async () => {
    const user = userEvent.setup();
    apiWith({
      ...QUEST,
      puzzles: [
        { ...stop("riddle"), cardWord: "SHOW" },
        { ...stop("cipher"), cardWord: "ALL OF US" },
        stop("finale"),
      ],
    });
    const patch = vi
      .spyOn(api, "PATCH")
      .mockResolvedValue(ok(asStored(QUEST)) as never);
    show("/quest/trail/edit");

    const riddle = await screen.findByLabelText("Card word for The riddle");
    expect(riddle).toHaveValue("SHOW");
    await user.clear(screen.getByLabelText("Card word for The cipher"));
    await user.type(
      screen.getByLabelText("Card word for The finale"),
      " PUZZLEQUEST "
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch.mock.calls[0]![1]).toMatchObject({
      body: {
        puzzles: [
          { puzzleName: "riddle", cardWord: "SHOW" },
          { puzzleName: "cipher", cardWord: "" },
          { puzzleName: "finale", cardWord: "PUZZLEQUEST" },
        ],
      },
    });
  });

  it("makes a quest private, and shows that it is", async () => {
    const user = userEvent.setup();
    apiWith({ ...QUEST, visibility: "private" });
    const patch = vi
      .spyOn(api, "PATCH")
      .mockResolvedValue(ok(asStored(QUEST)) as never);
    show("/quest/trail/edit");

    const box = await screen.findByLabelText("Private");
    expect(box).toBeChecked();
    await user.click(box);
    await user.click(box);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch.mock.calls[0]?.[1]).toMatchObject({
      body: { visibility: "private" },
    });
  });

  it("doesn't offer puzzles the quest already has", async () => {
    const user = userEvent.setup();
    apiWith(QUEST);
    show("/quest/trail/edit");

    await user.click(
      await screen.findByRole("button", { name: "Add puzzles" })
    );
    const picker = screen.getByRole("dialog", { name: "Add puzzles" });

    expect(await within(picker).findByLabelText(/The lantern/)).toBeVisible();
    expect(
      within(picker).queryByLabelText(/The riddle/)
    ).not.toBeInTheDocument();
  });

  it("keeps the stops the players have reached in place", async () => {
    apiWith(RUNNING);
    show("/quest/trail/edit");

    const reached = within(
      (await screen.findByText("The riddle")).closest("li")!
    );
    expect(reached.getByText("Reached")).toBeVisible();
    expect(reached.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move The cipher up" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move The cipher" })
    ).toBeVisible();
    expect(
      screen.getByText(
        /The players have reached the first stop, so it stays in place/
      )
    ).toBeVisible();
  });

  it("locks a completed quest's stops", async () => {
    apiWith({
      ...RUNNING,
      status: "completed",
      statusDescription: "Completed",
      puzzles: ["riddle", "cipher", "finale"].map((name) => stop(name, true)),
    });
    show("/quest/trail/edit");

    expect(
      await screen.findByText(
        /completed, so its stops can't change until it's reset/
      )
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Add puzzles" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Remove/ })
    ).not.toBeInTheDocument();
  });

  it("says why the server refused the change", async () => {
    const user = userEvent.setup();
    apiWith(RUNNING);
    vi.spyOn(api, "PATCH").mockResolvedValue(
      refusal(
        "wrong-state",
        "Puzzle cipher has already been reached by the players, so it must stay in its place at the start of the quest"
      ) as never
    );
    show("/quest/trail/edit");

    await user.click(
      await screen.findByRole("button", { name: "Remove The cipher" })
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Puzzle cipher has already been reached"
    );
  });

  it("adds, orders and removes the teams and players who play it", async () => {
    const user = userEvent.setup();
    apiWith(QUEST);
    const patch = vi
      .spyOn(api, "PATCH")
      .mockResolvedValue(ok(asStored(QUEST)) as never);
    show("/quest/trail/edit");

    const choice = await screen.findByLabelText("Add a team or player");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "Pat (pat)" })
      ).toBeInTheDocument()
    );
    // Those already playing aren't offered again.
    expect(
      screen.queryByRole("option", { name: "The Reds (reds)" })
    ).not.toBeInTheDocument();
    await user.selectOptions(choice, "team:blues");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.selectOptions(choice, "player:pat");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(entrantNames()).toEqual([
      "The Reds (team)",
      "The Blues (team)",
      "Pat (player)",
    ]);
    await user.click(
      screen.getByRole("button", { name: "Move Pat (player) up" })
    );
    await user.click(
      screen.getByRole("button", { name: "Remove The Reds (team)" })
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch.mock.calls[0]?.[1]).toMatchObject({
      body: {
        entrants: [
          { kind: "player", name: "pat" },
          { kind: "team", name: "blues" },
        ],
      },
    });
  });

  it("keeps a team that has started, until it's reset", async () => {
    apiWith(RUNNING);
    show("/quest/trail/edit");

    const reds = within(
      (await screen.findByText("The Reds (team)")).closest("li")!
    );
    expect(reds.getByText("Started")).toBeVisible();
    expect(
      reds.queryByRole("button", { name: /^Remove/ })
    ).not.toBeInTheDocument();
    expect(
      reds.getByRole("button", { name: "Move The Reds (team) down" })
    ).toBeDisabled();
  });

  it.each([
    [
      "wrong-state",
      "The Reds (team) has started quest trail, so can't be removed from it; reset it first",
    ],
    [
      "invalid-quest",
      "Player pat would be in two of the quest's entrants, team reds and user pat; a player may be in only one",
    ],
  ])(
    "shows the server's %s objection to the entrants beside them",
    async (type, detail) => {
      const user = userEvent.setup();
      apiWith(QUEST);
      vi.spyOn(api, "PATCH").mockResolvedValue(
        refusal(type, detail, [
          { path: "body.entrants", message: detail },
        ]) as never
      );
      show("/quest/trail/edit");

      await user.click(await screen.findByRole("button", { name: "Save" }));

      const entrants = screen.getByRole("group", { name: "Entrants" });
      expect(await within(entrants).findByText(detail)).toBeVisible();
      expect(entrants).toHaveAccessibleDescription(detail);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    }
  );

  it("says when there's no such quest", async () => {
    apiWith(null);
    show("/quest/missing/edit");

    expect(
      await screen.findByRole("heading", { name: "Quest not found" })
    ).toBeVisible();
  });
});
