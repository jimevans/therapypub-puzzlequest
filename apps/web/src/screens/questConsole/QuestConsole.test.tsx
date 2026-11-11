import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { aUser, ok, refusal, withOneEntry } from "../../test/fakes";
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
const REDS = { kind: "team", name: "reds" };

/** A race: the Reds, running; the Blues, on the first stop; and Sam, alone. */
const [RED_ENTRY] = withOneEntry(RUNNING).entries;
const RACE = {
  name: "trail",
  displayName: "The Trail",
  entries: [
    RED_ENTRY,
    {
      ...RED_ENTRY,
      id: "entry-2",
      entrant: { kind: "team", name: "blues", displayName: "The Blues" },
      puzzles: [
        step("riddle", 2, "In progress"),
        step("cipher", 0, "Unavailable"),
        step("finale", 0, "Unavailable"),
      ],
      progress: { ...RED_ENTRY.progress, totalMs: 120000, puzzles: [] },
    },
    {
      ...RED_ENTRY,
      id: "entry-3",
      entrant: { kind: "user", name: "sam", displayName: "Sam" },
      status: 0,
      statusDescription: "Not yet started",
      puzzles: NOT_STARTED.puzzles,
      progress: { ...STOPPED, puzzles: [] },
    },
  ],
};
const EVENTS = [
  {
    type: "QuestStarted",
    at: "2026-11-07T10:00:00.000Z",
    actor: "boss",
    entrant: REDS,
  },
  {
    type: "HintRevealed",
    at: "2026-11-07T10:03:00.000Z",
    puzzleName: "riddle",
    actor: "player",
    data: { hintIndex: 0, timePenalty: 60 },
    entrant: REDS,
  },
  {
    type: "PuzzleSolved",
    at: "2026-11-07T10:05:00.000Z",
    puzzleName: "riddle",
    actor: "player",
    entrant: REDS,
  },
  {
    type: "PuzzleActivated",
    at: "2026-11-07T10:06:00.000Z",
    puzzleName: "cipher",
    actorDeleted: true,
    entrant: REDS,
  },
];

/** The quest as the API gives it, played by the Reds alone. */
const asStored = (quest: typeof RUNNING) => withOneEntry(quest);

/**
 * Has the API answer with this quest and its events.
 * @param quest the quest, with its one entry's progress beside it, or the
 *  quest as the API gives it, with its entries
 * @param events the quest's event log
 */
function apiQuest(
  quest:
    ({ name: string; displayName: string } & Record<string, unknown>) | null,
  events: unknown[] = EVENTS
) {
  const stored = quest && ("entries" in quest ? quest : withOneEntry(quest));
  return vi.spyOn(api, "GET").mockImplementation((async (path: string) => {
    if (path === "/quests/{name}") {
      return stored ? ok(stored) : refusal("not-found", "No such quest");
    }
    if (path === "/quests/{name}/events") {
      return ok({ items: events, next: null });
    }
    return ok({ user: aUser({ userName: "boss", authorizationLevel: 10 }) });
  }) as never);
}

function show(path = "/quest/trail") {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
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
      within(rows[3]!).getByRole("button", { name: "QR code for The finale" })
    ).toBeVisible();
    // Shortened on screen; the whole code shows when hovered.
    expect(within(rows[3]!).getByTitle("FINALE1")).toHaveTextContent("FINALE1");
    expect(screen.getByText("The Reds (team)")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Run book (PDF)" })
    ).toHaveAttribute("href", "/api/v1/quests/trail/run-book");
    expect(
      screen.getByRole("link", { name: "QR cards to print (PDF)" })
    ).toHaveAttribute("href", "/api/v1/quests/trail/qr-cards");
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
      screen.queryByRole("button", { name: /^(Skip|Reset) The finale/ })
    ).not.toBeInTheDocument();
  });

  it("shows a stop's QR code to scan, with its code and a download", async () => {
    const user = userEvent.setup();
    apiQuest(RUNNING);
    show();

    await user.click(
      await screen.findByRole("button", { name: "QR code for The finale" })
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Stop 3: The finale",
    });
    expect(
      within(dialog).getByRole("img", {
        name: "QR code for activating The finale",
      })
    ).toHaveAttribute("src", "/api/v1/quests/trail/puzzles/finale/qr-code");
    expect(dialog).toHaveTextContent("Or type FINALE1");
    const download = within(dialog).getByRole("link", { name: "Download PNG" });
    expect(download).toHaveAttribute(
      "href",
      "/api/v1/quests/trail/puzzles/finale/qr-code"
    );
    expect(download).toHaveAttribute("download", "trail-finale-qr-code.png");

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(
      screen.queryByRole("dialog", { name: "Stop 3: The finale" })
    ).not.toBeInTheDocument();
  });

  it("asks before starting a quest, then starts it", async () => {
    const user = userEvent.setup();
    apiQuest(NOT_STARTED);
    const post = vi
      .spyOn(api, "POST")
      .mockResolvedValue(ok(asStored(RUNNING)) as never);
    show();

    await user.click(await screen.findByRole("button", { name: "Start" }));
    const dialog = screen.getByRole("dialog", { name: "Start The Trail?" });
    expect(post).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Start" }));

    expect(post).toHaveBeenCalledWith("/quests/{name}/teams/{teamName}/start", {
      params: { path: { name: "trail", teamName: "reds" } },
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
    const post = vi
      .spyOn(api, "POST")
      .mockResolvedValue(ok(asStored(RUNNING)) as never);
    show();

    await user.click(await screen.findByRole("button", { name: "Pause" }));
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Pause The Trail?" })
      ).getByRole("button", { name: "Pause" })
    );
    expect(post).toHaveBeenCalledWith("/quests/{name}/teams/{teamName}/pause", {
      params: { path: { name: "trail", teamName: "reds" } },
    });
  });

  it("gives Pause and Resume their own IDs as the quest changes", async () => {
    const user = userEvent.setup();
    const get = apiQuest(RUNNING);
    vi.spyOn(api, "POST").mockResolvedValue(ok(asStored(RUNNING)) as never);
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
    const post = vi
      .spyOn(api, "POST")
      .mockResolvedValue(ok(asStored(RUNNING)) as never);
    show();

    expect(
      await screen.findByText(/Paused\. The clock is stopped/)
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Resume" }));

    expect(post).toHaveBeenCalledWith(
      "/quests/{name}/teams/{teamName}/resume",
      {
        params: { path: { name: "trail", teamName: "reds" } },
      }
    );
  });

  it("resets a puzzle, refunding its hints if asked", async () => {
    const user = userEvent.setup();
    apiQuest(RUNNING);
    const post = vi
      .spyOn(api, "POST")
      .mockResolvedValue(ok(asStored(RUNNING)) as never);
    show();

    await user.click(
      await screen.findByRole("button", { name: "Reset The riddle" })
    );
    const dialog = screen.getByRole("dialog", { name: "Reset The riddle?" });
    await user.click(within(dialog).getByLabelText(/Refund the penalties/));
    await user.click(within(dialog).getByRole("button", { name: "Reset" }));

    expect(post).toHaveBeenCalledWith(
      "/quests/{name}/teams/{teamName}/puzzles/{puzzleName}/reset",
      {
        params: {
          path: { name: "trail", teamName: "reds", puzzleName: "riddle" },
        },
        body: { refundHints: true },
      }
    );
  });

  it("skips a puzzle after asking", async () => {
    const user = userEvent.setup();
    apiQuest(RUNNING);
    const post = vi
      .spyOn(api, "POST")
      .mockResolvedValue(ok(asStored(RUNNING)) as never);
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
      "/quests/{name}/teams/{teamName}/puzzles/{puzzleName}/skip",
      {
        params: {
          path: { name: "trail", teamName: "reds", puzzleName: "cipher" },
        },
      }
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
    // A quest with one team has no one else to choose.
    expect(within(dialog).queryByLabelText("Send to")).not.toBeInTheDocument();
    expect(post).toHaveBeenCalledWith(
      "/quests/{name}/teams/{teamName}/text-messages",
      {
        params: { path: { name: "trail", teamName: "reds" } },
        body: {
          message: "Look up",
          expectedResponse: "lighthouse",
          responseConfirmation: "Well done",
        },
      }
    );
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
      entrant: REDS,
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

describe("the quest console, for a race", () => {
  const RACE_EVENTS = [
    ...EVENTS,
    {
      type: "PuzzleActivated",
      at: "2026-11-07T10:07:00.000Z",
      puzzleName: "riddle",
      actor: "blue",
      entrant: { kind: "team", name: "blues" },
    },
  ];

  it("shows every team and player, how each is doing, to choose one", async () => {
    apiQuest(RACE, RACE_EVENTS);
    show();

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("RankEntrantStatusTimeCurrent stop");
    expect(rows[1]).toHaveTextContent(
      "–The Reds (team)In progress11:00Stop 2: The cipher"
    );
    expect(rows[2]).toHaveTextContent(
      "The Blues (team)In progress2:00Stop 1: The riddle"
    );
    expect(rows[3]).toHaveTextContent("Sam (player)Not yet started––");
    expect(
      within(rows[2]!).getByRole("link", { name: "The Blues (team)" })
    ).toHaveAttribute("href", "/quest/trail?entry=team%3Ablues");
    // Nothing more until one is chosen.
    expect(
      screen.queryByRole("heading", { name: "Stops" })
    ).not.toBeInTheDocument();
  });

  it("ranks those who have finished, putting the table in leaderboard order", async () => {
    const [reds, blues, sam] = RACE.entries;
    apiQuest(
      {
        ...RACE,
        entries: [
          { ...reds!, rank: null },
          {
            ...blues!,
            status: 2,
            statusDescription: "Completed",
            rank: 1,
          },
          { ...sam!, rank: null },
        ],
      },
      RACE_EVENTS
    );
    show();

    const rows = within(await screen.findByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("1stThe Blues (team)Completed");
    expect(rows[2]).toHaveTextContent("–The Reds (team)In progress");
    expect(rows[3]).toHaveTextContent("–Sam (player)Not yet started");
  });

  it("shows the team chosen: its stops, its actions, and its activity", async () => {
    const user = userEvent.setup();
    apiQuest(RACE, RACE_EVENTS);
    show();

    await user.click(
      await screen.findByRole("link", { name: "The Blues (team)" })
    );

    const blues = within(
      screen.getByRole("region", { name: "The Blues (team)" })
    );
    expect(
      screen.getByRole("link", { name: "The Blues (team)" })
    ).toHaveAttribute("aria-current", "true");
    const stops = blues.getAllByRole("table")[0]!;
    expect(within(stops).getAllByRole("row")[1]).toHaveTextContent(
      "1The riddleRIDDLE1In progress"
    );
    expect(blues.getByRole("button", { name: "Pause" })).toBeVisible();
    const activity = within(blues.getByRole("region", { name: "Activity" }));
    await waitFor(() =>
      expect(activity.getAllByRole("listitem")).toHaveLength(1)
    );
    expect(activity.getByRole("listitem")).toHaveTextContent(
      "The riddle activated by blue"
    );

    await user.click(
      activity.getByLabelText("Show every team's and player's activity")
    );
    const items = activity.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("The Blues: The riddle activated");
    expect(items[1]).toHaveTextContent("The Reds: The cipher activated");
  });

  it("runs the team chosen in the address alone", async () => {
    const user = userEvent.setup();
    apiQuest(RACE, RACE_EVENTS);
    const post = vi.spyOn(api, "POST").mockResolvedValue(ok(RACE) as never);
    show("/quest/trail?entry=team:blues");

    const blues = within(
      await screen.findByRole("region", { name: "The Blues (team)" })
    );
    await user.click(blues.getByRole("button", { name: "Pause" }));
    await user.click(
      within(
        screen.getByRole("dialog", {
          name: "Pause The Trail for The Blues (team)?",
        })
      ).getByRole("button", { name: "Pause" })
    );
    await user.click(blues.getByRole("button", { name: "Skip The riddle" }));
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Skip The riddle?" })
      ).getByRole("button", { name: "Skip" })
    );

    expect(post).toHaveBeenCalledWith("/quests/{name}/teams/{teamName}/pause", {
      params: { path: { name: "trail", teamName: "blues" } },
    });
    expect(post).toHaveBeenCalledWith(
      "/quests/{name}/teams/{teamName}/puzzles/{puzzleName}/skip",
      {
        params: {
          path: { name: "trail", teamName: "blues", puzzleName: "riddle" },
        },
      }
    );
  });

  it("starts a player on their own by their user name", async () => {
    const user = userEvent.setup();
    apiQuest(RACE, RACE_EVENTS);
    const post = vi.spyOn(api, "POST").mockResolvedValue(ok(RACE) as never);
    show("/quest/trail?entry=user:sam");

    const sam = within(
      await screen.findByRole("region", { name: "Sam (player)" })
    );
    await user.click(sam.getByRole("button", { name: "Start" }));
    await user.click(
      within(
        screen.getByRole("dialog", {
          name: "Start The Trail for Sam (player)?",
        })
      ).getByRole("button", { name: "Start" })
    );

    expect(post).toHaveBeenCalledWith(
      "/quests/{name}/players/{userName}/start",
      { params: { path: { name: "trail", userName: "sam" } } }
    );
  });

  it.each([
    ["Start all", "start", "Start The Trail for everyone?"],
    ["Pause all", "pause", "Pause The Trail for everyone?"],
    ["Reset all", "reset", "Reset The Trail for everyone?"],
  ])(
    "asks before the quest-wide %s, then does it to everyone",
    async (label, action, title) => {
      const user = userEvent.setup();
      apiQuest(RACE, RACE_EVENTS);
      const post = vi.spyOn(api, "POST").mockResolvedValue(ok(RACE) as never);
      show();

      await user.click(await screen.findByRole("button", { name: label }));
      const dialog = screen.getByRole("dialog", { name: title });
      expect(post).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole("button", { name: label }));

      expect(post).toHaveBeenCalledWith(`/quests/{name}/${action}`, {
        params: { path: { name: "trail" } },
      });
    }
  );

  it("offers resuming everyone once any is paused", async () => {
    const user = userEvent.setup();
    const [reds, blues, sam] = RACE.entries;
    apiQuest({ ...RACE, entries: [{ ...reds!, paused: true }, blues!, sam!] });
    const post = vi.spyOn(api, "POST").mockResolvedValue(ok(RACE) as never);
    show();

    await user.click(await screen.findByRole("button", { name: "Resume all" }));
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Resume The Trail for everyone?" })
      ).getByRole("button", { name: "Resume all" })
    );

    expect(post).toHaveBeenCalledWith("/quests/{name}/resume", {
      params: { path: { name: "trail" } },
    });
  });

  it("texts everyone, unless a team is chosen", async () => {
    const user = userEvent.setup();
    apiQuest(RACE, RACE_EVENTS);
    const post = vi
      .spyOn(api, "POST")
      .mockResolvedValue(ok(undefined, 204) as never);
    show();

    await user.click(
      await screen.findByRole("button", { name: "Text the players" })
    );
    let dialog = screen.getByRole("dialog", { name: "Text the players" });
    expect(within(dialog).getByLabelText("Send to")).toHaveDisplayValue(
      "Everyone"
    );
    await user.type(within(dialog).getByLabelText("Message"), "Hurry");
    await user.click(within(dialog).getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Message sent.")).toBeVisible();
    expect(post).toHaveBeenLastCalledWith("/quests/{name}/text-messages", {
      params: { path: { name: "trail" } },
      body: { message: "Hurry" },
    });

    await user.click(screen.getByRole("link", { name: "The Blues (team)" }));
    await user.click(screen.getByRole("button", { name: "Text the players" }));
    dialog = screen.getByRole("dialog", { name: "Text the players" });
    expect(within(dialog).getByLabelText("Send to")).toHaveDisplayValue(
      "The Blues (team)"
    );
    await user.type(within(dialog).getByLabelText("Message"), "Nearly");
    await user.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith(
        "/quests/{name}/teams/{teamName}/text-messages",
        {
          params: { path: { name: "trail", teamName: "blues" } },
          body: { message: "Nearly" },
        }
      )
    );
  });

  it("texts one player chosen to send to", async () => {
    const user = userEvent.setup();
    apiQuest(RACE, RACE_EVENTS);
    const post = vi
      .spyOn(api, "POST")
      .mockResolvedValue(ok(undefined, 204) as never);
    show();

    await user.click(
      await screen.findByRole("button", { name: "Text the players" })
    );
    const dialog = screen.getByRole("dialog", { name: "Text the players" });
    await user.selectOptions(
      within(dialog).getByLabelText("Send to"),
      "Sam (player)"
    );
    await user.type(within(dialog).getByLabelText("Message"), "Hi Sam");
    await user.click(within(dialog).getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/quests/{name}/players/{userName}/text-messages",
        {
          params: { path: { name: "trail", userName: "sam" } },
          body: { message: "Hi Sam" },
        }
      )
    );
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
      describeEvent(
        { at: "2026-11-07T10:00:00.000Z", entrant: null, ...event },
        label
      )
    ).toBe(words);
  });
});
