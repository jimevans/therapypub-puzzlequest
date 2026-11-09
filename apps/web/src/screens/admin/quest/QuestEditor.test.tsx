import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api";
import { aUser, ok, refusal } from "../../../test/fakes";
import { QuestEditor } from "./QuestEditor";

const STOPPED = { running: false, elapsedMs: 0, penaltyMs: 0, totalMs: 0 };

function stop(puzzleName: string, status = 0) {
  return {
    puzzleName,
    displayName: `The ${puzzleName}`,
    status,
    statusDescription: status ? "Completed" : "Unavailable",
    nextHintToDisplay: 0,
    activationCode: `${puzzleName}-code`,
    skipped: false,
  };
}

const QUEST = {
  name: "trail",
  displayName: "The Trail",
  assignee: { kind: "team", id: "1", name: "reds", displayName: "The Reds" },
  status: 0,
  statusDescription: "Not yet started",
  paused: false,
  puzzles: [stop("riddle"), stop("cipher"), stop("finale")],
  progress: { ...STOPPED, puzzles: [] },
};
const RUNNING = {
  ...QUEST,
  status: 1,
  statusDescription: "In progress",
  puzzles: [stop("riddle", 3), stop("cipher"), stop("finale")],
};
const PUZZLES = ["riddle", "cipher", "finale", "lantern", "bell"].map(
  (name) => ({
    name,
    displayName: `The ${name}`,
    type: 0,
    text: "",
    solutionKeyword: "x",
    solutionDisplayText: "X",
    hints: [],
  })
);

/** Has the API answer with this quest, and everyone and everything. */
function apiWith(quest: unknown) {
  return vi.spyOn(api, "GET").mockImplementation((async (path: string) => {
    switch (path) {
      case "/quests/{name}":
        return quest ? ok(quest) : refusal("not-found", "No such quest");
      case "/users":
        return ok({
          items: [aUser({ userName: "pat", displayName: "Pat" })],
          next: null,
        });
      case "/teams":
        return ok({
          items: [{ teamName: "reds", displayName: "The Reds", members: [] }],
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
      .mockResolvedValue(ok(QUEST, 201) as never);
    const router = show("/quest/new");

    await user.type(await screen.findByLabelText("Name"), "trail");
    await user.type(screen.getByLabelText("Display name"), "The Trail");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "The Reds (reds)" })
      ).toBeInTheDocument()
    );
    await user.selectOptions(screen.getByLabelText("Assigned to"), "team:reds");
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
        name: "trail",
        displayName: "The Trail",
        visibility: "public",
        assignee: { kind: "team", name: "reds" },
        puzzles: [{ puzzleName: "lantern" }, { puzzleName: "riddle" }],
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
    expect(screen.getByText("Choose a team or a player")).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the server's objection beside the field", async () => {
    const user = userEvent.setup();
    apiWith(null);
    vi.spyOn(api, "POST").mockResolvedValue(
      refusal("already-exists", "A quest named trail already exists", [
        { path: "body.name", message: "Already taken" },
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
    await user.selectOptions(screen.getByLabelText("Assigned to"), "user:pat");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Already taken")).toBeVisible();
  });
});

describe("editing a quest", () => {
  it("reorders and removes stops, keeping their codes", async () => {
    const user = userEvent.setup();
    apiWith(QUEST);
    const patch = vi.spyOn(api, "PATCH").mockResolvedValue(ok(QUEST) as never);
    show("/quest/trail/edit");

    expect(await screen.findByLabelText("Assigned to")).toHaveValue(
      "team:reds"
    );
    expect(screen.getByText("riddle-code")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Move The finale up" })
    );
    expect(stopNames()).toEqual(["The riddle", "The finale", "The cipher"]);
    await user.click(screen.getByRole("button", { name: "Remove The riddle" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith("/quests/{name}", {
      params: { path: { name: "trail" } },
      body: {
        displayName: "The Trail",
        visibility: "public",
        assignee: { kind: "team", name: "reds" },
        puzzles: [{ puzzleName: "finale" }, { puzzleName: "cipher" }],
      },
    });
  });

  it("makes a quest private, and shows that it is", async () => {
    const user = userEvent.setup();
    apiWith({ ...QUEST, visibility: "private" });
    const patch = vi.spyOn(api, "PATCH").mockResolvedValue(ok(QUEST) as never);
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
      status: 2,
      statusDescription: "Completed",
      puzzles: RUNNING.puzzles.map((puzzle) => ({ ...puzzle, status: 3 })),
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

  it("says when there's no such quest", async () => {
    apiWith(null);
    show("/quest/missing/edit");

    expect(
      await screen.findByRole("heading", { name: "Quest not found" })
    ).toBeVisible();
  });
});
