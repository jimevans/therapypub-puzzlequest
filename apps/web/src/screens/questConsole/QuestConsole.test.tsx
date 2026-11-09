import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { aUser, ok, refusal } from "../../test/fakes";
import QuestConsole from "./QuestConsole";
import { describeEvent } from "./describeEvent";

// The share links panel has tests of its own; this stands in for it.
vi.mock("../../quests/ShareLinksSection", () => ({
  ShareLinksSection: () => <p>Share links here</p>,
}));

vi.mock("../../live/useLiveQuest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../live/useLiveQuest")>()),
  useLiveQuest: () => ({ connected: true, connectionId: () => undefined }),
}));

const STOPPED = { running: false, elapsedMs: 0, penaltyMs: 0, totalMs: 0 };
const HINTS = [
  { text: "One", solutionWarning: false, timePenalty: 60 },
  { text: "Two", solutionWarning: true, timePenalty: 300 },
];

function step(
  puzzleName: string,
  status: number,
  statusDescription: string,
  extra: object = {}
) {
  return {
    puzzleName,
    displayName: `The ${puzzleName}`,
    status,
    statusDescription,
    nextHintToDisplay: 0,
    activationCode: `${puzzleName.toUpperCase()}1`,
    skipped: false,
    solutionDisplayText: `${puzzleName} solved`,
    hints: HINTS,
    ...extra,
  };
}

const RUNNING = {
  name: "trail",
  displayName: "The Trail",
  assignee: { kind: "team", id: "1", name: "reds", displayName: "The Reds" },
  status: 1,
  statusDescription: "In progress",
  paused: false,
  puzzles: [
    step("riddle", 3, "Completed", { nextHintToDisplay: 1 }),
    step("cipher", 2, "In progress"),
    step("finale", 0, "Unavailable"),
  ],
  progress: {
    ...STOPPED,
    startTime: "2026-11-07T10:00:00.000Z",
    elapsedMs: 600000,
    totalMs: 660000,
    puzzles: [
      {
        puzzleName: "riddle",
        ...STOPPED,
        startTime: "2026-11-07T10:00:00.000Z",
        totalMs: 300000,
      },
    ],
  },
};
const NOT_STARTED = {
  ...RUNNING,
  status: 0,
  statusDescription: "Not yet started",
  puzzles: RUNNING.puzzles.map((puzzle) => ({
    ...puzzle,
    status: 0,
    statusDescription: "Unavailable",
  })),
  progress: { ...STOPPED, puzzles: [] },
};
const EVENTS = [
  { type: "QuestStarted", at: "2026-11-07T10:00:00.000Z", actor: "boss" },
  {
    type: "HintRevealed",
    at: "2026-11-07T10:03:00.000Z",
    puzzleName: "riddle",
    actor: "player",
    data: { hintIndex: 0, timePenalty: 60 },
  },
  {
    type: "PuzzleSolved",
    at: "2026-11-07T10:05:00.000Z",
    puzzleName: "riddle",
    actor: "player",
  },
  {
    type: "PuzzleActivated",
    at: "2026-11-07T10:06:00.000Z",
    puzzleName: "cipher",
    actorDeleted: true,
  },
];

/** Has the API answer with this quest and its events. */
function apiQuest(quest: unknown, events: unknown[] = EVENTS) {
  return vi.spyOn(api, "GET").mockImplementation((async (path: string) => {
    if (path === "/quests/{name}") {
      return quest ? ok(quest) : refusal("not-found", "No such quest");
    }
    if (path === "/quests/{name}/events") {
      return ok({ items: events, next: null });
    }
    return ok({ user: aUser({ userName: "boss", authorizationLevel: 10 }) });
  }) as never);
}

function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/quest/trail"]}>
        <Routes>
          <Route path="/quest/:name" element={<QuestConsole />} />
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

describe("the quest console", () => {
  it("shows every stop in order, with what's needed to run it", async () => {
    apiQuest(RUNNING);
    show();

    const rows = within(await screen.findByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent(
      "1The riddleRIDDLE1CompletedRIDDLE11 of 25:00riddle solved"
    );
    expect(rows[3]).toHaveTextContent(
      "3The finaleFINALE1UnavailableFINALE10 of 2"
    );
    expect(
      within(rows[1]!).getByRole("link", { name: "The riddle" })
    ).toHaveAttribute("href", "/puzzle/riddle");
    expect(
      within(rows[3]!).getByRole("link", { name: "QR code for The finale" })
    ).toHaveAttribute("href", "/api/v1/quests/trail/puzzles/finale/qr-code");
    expect(screen.getByText("The Reds (team)")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Run book (PDF)" })
    ).toHaveAttribute("href", "/api/v1/quests/trail/run-book");
  });

  it("puts the share links after the stops and before the activity", async () => {
    apiQuest(RUNNING);
    show();

    const shareLinks = await screen.findByText("Share links here");
    const follows = (first: Node, second: Node) =>
      Boolean(
        first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
      );
    expect(
      follows(screen.getByRole("heading", { name: "Stops" }), shareLinks)
    ).toBe(true);
    expect(
      follows(shareLinks, screen.getByRole("heading", { name: "Activity" }))
    ).toBe(true);
  });

  it("offers skipping a puzzle the players are on, and resetting a solved one", async () => {
    apiQuest(RUNNING);
    show();

    await screen.findByRole("table");
    expect(
      screen.getByRole("button", { name: "Reset The riddle" })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Skip The cipher" })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /The finale/ })
    ).not.toBeInTheDocument();
  });

  it("asks before starting a quest, then starts it", async () => {
    const user = userEvent.setup();
    apiQuest(NOT_STARTED);
    const post = vi.spyOn(api, "POST").mockResolvedValue(ok(RUNNING) as never);
    show();

    await user.click(await screen.findByRole("button", { name: "Start" }));
    const dialog = screen.getByRole("dialog", { name: "Start The Trail?" });
    expect(post).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Start" }));

    expect(post).toHaveBeenCalledWith("/quests/{name}/start", {
      params: { path: { name: "trail" } },
    });
    expect(
      screen.queryByRole("button", { name: "Pause" })
    ).not.toBeInTheDocument();
  });

  it("does nothing if the administrator doesn't confirm", async () => {
    const user = userEvent.setup();
    apiQuest(RUNNING);
    const post = vi.spyOn(api, "POST");
    show();

    await user.click(await screen.findByRole("button", { name: "Reset" }));
    const dialog = screen.getByRole("dialog", { name: "Reset The Trail?" });
    expect(dialog).toHaveTextContent("The activity log keeps what happened.");
    await user.click(within(dialog).getByRole("button", { name: "Not now" }));

    expect(post).not.toHaveBeenCalled();
  });

  it("pauses after asking, and resumes at once", async () => {
    const user = userEvent.setup();
    apiQuest(RUNNING);
    const post = vi.spyOn(api, "POST").mockResolvedValue(ok(RUNNING) as never);
    show();

    await user.click(await screen.findByRole("button", { name: "Pause" }));
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Pause The Trail?" })
      ).getByRole("button", { name: "Pause" })
    );
    expect(post).toHaveBeenCalledWith("/quests/{name}/pause", {
      params: { path: { name: "trail" } },
    });
  });

  it("gives Pause and Resume their own IDs as the quest changes", async () => {
    const user = userEvent.setup();
    const get = apiQuest(RUNNING);
    vi.spyOn(api, "POST").mockResolvedValue(ok(RUNNING) as never);
    show();

    expect(
      await screen.findByRole("button", { name: "Pause" })
    ).toHaveAttribute("id", "pause-quest");
    get.mockRestore();
    apiQuest({ ...RUNNING, paused: true });
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Pause The Trail?" })
      ).getByRole("button", { name: "Pause" })
    );

    expect(
      await screen.findByRole("button", { name: "Resume" })
    ).toHaveAttribute("id", "resume-quest");
  });

  it("shows a paused quest, with the way to resume it", async () => {
    const user = userEvent.setup();
    apiQuest({ ...RUNNING, paused: true });
    const post = vi.spyOn(api, "POST").mockResolvedValue(ok(RUNNING) as never);
    show();

    expect(
      await screen.findByText(/Paused\. The clock is stopped/)
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Resume" }));

    expect(post).toHaveBeenCalledWith("/quests/{name}/resume", {
      params: { path: { name: "trail" } },
    });
  });

  it("resets a puzzle, refunding its hints if asked", async () => {
    const user = userEvent.setup();
    apiQuest(RUNNING);
    const post = vi.spyOn(api, "POST").mockResolvedValue(ok(RUNNING) as never);
    show();

    await user.click(
      await screen.findByRole("button", { name: "Reset The riddle" })
    );
    const dialog = screen.getByRole("dialog", { name: "Reset The riddle?" });
    await user.click(within(dialog).getByLabelText(/Refund the penalties/));
    await user.click(within(dialog).getByRole("button", { name: "Reset" }));

    expect(post).toHaveBeenCalledWith(
      "/quests/{name}/puzzles/{puzzleName}/reset",
      {
        params: { path: { name: "trail", puzzleName: "riddle" } },
        body: { refundHints: true },
      }
    );
  });

  it("skips a puzzle after asking", async () => {
    const user = userEvent.setup();
    apiQuest(RUNNING);
    const post = vi.spyOn(api, "POST").mockResolvedValue(ok(RUNNING) as never);
    show();

    await user.click(
      await screen.findByRole("button", { name: "Skip The cipher" })
    );
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Skip The cipher?" })
      ).getByRole("button", { name: "Skip" })
    );

    expect(post).toHaveBeenCalledWith(
      "/quests/{name}/puzzles/{puzzleName}/skip",
      { params: { path: { name: "trail", puzzleName: "cipher" } } }
    );
  });

  it("says why an action was refused", async () => {
    const user = userEvent.setup();
    apiQuest(RUNNING);
    vi.spyOn(api, "POST").mockResolvedValue(
      refusal("wrong-state", "The quest is already paused") as never
    );
    show();

    await user.click(await screen.findByRole("button", { name: "Pause" }));
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Pause The Trail?" })
      ).getByRole("button", { name: "Pause" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The quest is already paused"
    );
  });

  it("texts the players, waiting for a reply only with a confirmation", async () => {
    const user = userEvent.setup();
    apiQuest(RUNNING);
    const post = vi
      .spyOn(api, "POST")
      .mockResolvedValue(ok(undefined, 204) as never);
    show();

    await user.click(
      await screen.findByRole("button", { name: "Text the players" })
    );
    const dialog = screen.getByRole("dialog", { name: "Text the players" });
    await user.click(within(dialog).getByRole("button", { name: "Send" }));
    expect(within(dialog).getByText("Enter the message")).toBeVisible();

    await user.type(within(dialog).getByLabelText("Message"), "Look up");
    await user.type(
      within(dialog).getByLabelText("Reply to wait for (optional)"),
      "lighthouse"
    );
    await user.click(within(dialog).getByRole("button", { name: "Send" }));
    expect(
      within(dialog).getByText("Enter what to send back when the reply arrives")
    ).toBeVisible();
    expect(post).not.toHaveBeenCalled();

    await user.type(
      within(dialog).getByLabelText("Confirmation to send back"),
      "Well done"
    );
    await user.click(within(dialog).getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Message sent.")).toBeVisible();
    expect(post).toHaveBeenCalledWith("/quests/{name}/text-messages", {
      params: { path: { name: "trail" } },
      body: {
        message: "Look up",
        expectedResponse: "lighthouse",
        responseConfirmation: "Well done",
      },
    });
  });

  it("keeps the message open when it can't be sent", async () => {
    const user = userEvent.setup();
    apiQuest(RUNNING);
    vi.spyOn(api, "POST").mockResolvedValue(
      refusal(
        "no-recipients",
        "None of the quest's players accept text messages"
      ) as never
    );
    show();

    await user.click(
      await screen.findByRole("button", { name: "Text the players" })
    );
    const dialog = screen.getByRole("dialog", { name: "Text the players" });
    await user.type(within(dialog).getByLabelText("Message"), "Hello");
    await user.click(within(dialog).getByRole("button", { name: "Send" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "None of the quest's players accept text messages"
    );
  });

  it("shows the reply the quest is waiting for", async () => {
    apiQuest({
      ...RUNNING,
      textResponse: "lighthouse",
      textResponseConfirmation: "Well done",
    });
    show();

    expect(
      await screen.findByText(/lighthouse, then sending/)
    ).toHaveTextContent("lighthouse, then sending “Well done”");
  });

  it("lists what happened, newest first", async () => {
    apiQuest(RUNNING);
    show();

    const activity = within(
      await screen.findByRole("region", { name: "Activity" })
    );
    await waitFor(() =>
      expect(activity.getAllByRole("listitem")).toHaveLength(4)
    );
    const items = activity.getAllByRole("listitem");
    expect(items.shift()).toHaveTextContent(
      "The cipher activated by a deleted player"
    );
    expect(items[0]).toHaveTextContent("The riddle solved by player");
    expect(items[1]).toHaveTextContent(
      "Hint 1 revealed on The riddle, adding 1:00 by player"
    );
    expect(items[2]).toHaveTextContent("Quest started by boss");
  });

  it("shows the latest activity until asked for all of it", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 25 }, (_, index) => ({
      type: "QuestPaused",
      at: new Date(Date.UTC(2026, 10, 7, 10, index)).toISOString(),
    }));
    apiQuest(RUNNING, many);
    show();

    const activity = within(
      await screen.findByRole("region", { name: "Activity" })
    );
    await waitFor(() =>
      expect(activity.getAllByRole("listitem")).toHaveLength(20)
    );
    await user.click(activity.getByRole("button", { name: "Show all 25" }));
    expect(activity.getAllByRole("listitem")).toHaveLength(25);
  });

  it("says when there's no such quest", async () => {
    apiQuest(null);
    show();

    expect(
      await screen.findByRole("heading", { name: "Quest not found" })
    ).toBeVisible();
  });
});

describe("describing an event", () => {
  const label = (name: string) => `The ${name}`;

  it.each([
    [
      { type: "PuzzleStarted", puzzleName: "riddle" },
      "The riddle is next, waiting to be activated",
    ],
    [{ type: "PuzzleActivated", puzzleName: "riddle" }, "The riddle activated"],
    [{ type: "PuzzleSkipped", puzzleName: "riddle" }, "The riddle skipped"],
    [
      { type: "PuzzleReset", puzzleName: "riddle", data: { refundedHints: 0 } },
      "The riddle reset",
    ],
    [
      { type: "PuzzleReset", puzzleName: "riddle", data: { refundedHints: 1 } },
      "The riddle reset, refunding 1 hint's penalty",
    ],
    [
      { type: "PuzzleReset", puzzleName: "riddle", data: { refundedHints: 2 } },
      "The riddle reset, refunding 2 hints' penalties",
    ],
    [
      {
        type: "HintRevealed",
        puzzleName: "riddle",
        data: { hintIndex: 1, timePenalty: 0 },
      },
      "Hint 2 revealed on The riddle",
    ],
    [{ type: "QuestCompleted" }, "Quest finished"],
    [{ type: "QuestResumed" }, "Quest resumed"],
    [{ type: "QuestReset" }, "Quest reset"],
    [
      { type: "SomethingNew", puzzleName: "riddle" },
      "SomethingNew: The riddle",
    ],
    [{ type: "SomethingNew" }, "SomethingNew"],
  ])("describes %o", (event, words) => {
    expect(
      describeEvent({ at: "2026-11-07T10:00:00.000Z", ...event }, label)
    ).toBe(words);
  });
});
