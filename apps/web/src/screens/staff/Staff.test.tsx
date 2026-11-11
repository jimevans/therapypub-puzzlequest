import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { ok, refusal, withOneEntry } from "../../test/fakes";
import StaffHome from "./StaffHome";
import StaffQuest from "./StaffQuest";

// The share links panel has tests of its own.
vi.mock("../../quests/ShareLinksSection", () => ({
  ShareLinksSection: () => null,
}));

vi.mock("../../live/useLiveQuest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../live/useLiveQuest")>()),
  useLiveQuest: () => ({ connected: true, connectionId: () => undefined }),
}));

const STOPPED = {
  startTime: null,
  endTime: null,
  running: false,
  clockStart: null,
  elapsedMs: 0,
  penaltyMs: 0,
  totalMs: 0,
};

/** The stop statuses, in the order a stop goes through them. */
const STOP_STATUSES = [
  "notReached",
  "awaitingActivation",
  "inProgress",
  "completed",
] as const;

function step(name: string, stage: number, statusDescription: string) {
  return {
    puzzleName: name,
    displayName: `The ${name}`,
    status: STOP_STATUSES[stage],
    statusDescription,
    activationCode: name.toUpperCase(),
    skipped: false,
    hintsRevealed: stage === 3 ? 1 : 0,
    hintCount: 2,
    activationTime: stage >= 2 ? "2026-11-07T10:03:00.000Z" : null,
    startTime: stage >= 1 ? "2026-11-07T10:00:00.000Z" : null,
    endTime: stage === 3 ? "2026-11-07T10:15:00.000Z" : null,
  };
}

const QUEST = {
  questName: "trail",
  displayName: "The Trail",
  status: "inProgress",
  statusDescription: "In progress",
  paused: false,
  rank: null as number | null,
  progress: {
    ...STOPPED,
    startTime: "2026-11-07T10:00:00.000Z",
    puzzles: [
      {
        puzzleName: "riddle",
        ...STOPPED,
        startTime: "2026-11-07T10:00:00.000Z",
        totalMs: 900000,
      },
    ],
  },
  puzzles: [
    step("riddle", 3, "Completed"),
    step("cipher", 1, "Awaiting activation"),
    step("finale", 0, "Unavailable"),
  ],
};

/** A quest as staff's list shows it: no puzzles, so no length. */
const SUMMARY = {
  questName: QUEST.questName,
  displayName: QUEST.displayName,
  status: QUEST.status,
  statusDescription: QUEST.statusDescription,
  paused: QUEST.paused,
  rank: null as number | null,
  progress: { ...STOPPED, startTime: "2026-11-07T10:00:00.000Z" },
};

function show(element: React.ReactNode, path: string, pattern: string) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={pattern} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("staff's home", () => {
  it("lists every quest, those under way first", async () => {
    vi.spyOn(api, "GET").mockResolvedValue(
      ok({
        items: [
          withOneEntry({
            ...SUMMARY,
            questName: "done",
            displayName: "Done",
            status: "completed",
            statusDescription: "Completed",
          }),
          withOneEntry({
            ...SUMMARY,
            questName: "later",
            displayName: "Later",
            status: "notStarted",
          }),
          withOneEntry(SUMMARY),
        ],
        next: null,
      }) as never
    );
    show(<StaffHome />, "/", "/");

    const items = await screen.findAllByRole("listitem");
    expect(
      items.map((item) => within(item).getByRole("link").textContent)
    ).toEqual(["The Trail", "Later", "Done"]);
    expect(items[0]).toHaveTextContent("The Reds (team) · In progress");
    expect(within(items[0]!).getByRole("link")).toHaveAttribute(
      "href",
      "/quest/trail"
    );
  });
});

describe("staff's home, with a race", () => {
  it("shows each team in a race, and how it's doing", async () => {
    const [reds] = withOneEntry(SUMMARY).entries;
    vi.spyOn(api, "GET").mockResolvedValue(
      ok({
        items: [
          {
            questName: "race",
            displayName: "The Race",
            entries: [
              reds,
              {
                ...reds,
                id: "entry-2",
                entrant: { kind: "player", name: "sam", displayName: "Sam" },
                status: "completed",
                statusDescription: "Completed",
                rank: 1,
                progress: {
                  ...STOPPED,
                  startTime: "2026-11-07T10:00:00.000Z",
                  totalMs: 60_000,
                },
              },
              {
                ...reds,
                id: "entry-3",
                entrant: { kind: "team", name: "blues", displayName: "Blues" },
                status: "notStarted",
                statusDescription: "Not yet started",
                progress: STOPPED,
              },
            ],
          },
        ],
        next: null,
      }) as never
    );
    show(<StaffHome />, "/", "/");

    const quest = await screen.findByRole("link", { name: "The Race" });
    const card = within(quest.closest("li") as HTMLElement);
    // In leaderboard order: those finished, by rank, then those playing.
    const entries = card.getAllByRole("listitem");
    expect(entries[0]).toHaveTextContent("1st · Sam (player) · Completed1:00");
    expect(entries[1]).toHaveTextContent("The Reds (team) · In progress");
    expect(entries[1]).not.toHaveTextContent(/1st|2nd/);
    expect(entries[2]).toHaveTextContent("Blues (team) · Not yet started");
  });
});

describe("a quest, as staff follow it", () => {
  it("shows every stop in order, and where the players are", async () => {
    vi.spyOn(api, "GET").mockResolvedValue(ok(withOneEntry(QUEST)) as never);
    show(<StaffQuest />, "/quest/trail", "/quest/:name");

    const steps = within(
      await screen.findByRole("list", { name: "" })
    ).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent("Stop 1The riddle");
    expect(steps[0]).toHaveTextContent("Completed");
    expect(steps[0]).toHaveTextContent("Hints1 of 2");
    expect(steps[0]).toHaveTextContent("Time15:00");
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).toHaveTextContent("Players here · Awaiting activation");
    expect(steps[2]).toHaveTextContent("Stop 3The finaleUnavailable");
    expect(steps[2]).not.toHaveTextContent("Hints");
    expect(screen.getByText(/The Reds \(team\) · In progress/)).toBeVisible();
  });

  it("shows any stop's QR code for the players to scan", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "GET").mockResolvedValue(ok(withOneEntry(QUEST)) as never);
    show(<StaffQuest />, "/quest/trail", "/quest/:name");

    await user.click(
      await screen.findByRole("button", { name: "QR code for The cipher" })
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Stop 2: The cipher",
    });
    expect(
      within(dialog).getByRole("img", {
        name: "QR code for activating The cipher",
      })
    ).toHaveAttribute("src", "/api/v1/quests/trail/puzzles/cipher/qr-code");
    expect(dialog).toHaveTextContent("Or type CIPHER");
    expect(
      screen.getByRole("button", { name: "QR code for The finale" })
    ).toBeInTheDocument();
  });

  it("says when the quest is paused", async () => {
    vi.spyOn(api, "GET").mockResolvedValue(
      ok(withOneEntry({ ...QUEST, paused: true })) as never
    );
    show(<StaffQuest />, "/quest/trail", "/quest/:name");

    expect(
      await screen.findByText(/Paused by the puzzle master/)
    ).toBeVisible();
  });

  it("shows each team in a race, with its own stops", async () => {
    const [reds] = withOneEntry(QUEST).entries;
    vi.spyOn(api, "GET").mockResolvedValue(
      ok({
        questName: "trail",
        displayName: "The Trail",
        entries: [
          reds,
          {
            ...reds,
            id: "entry-2",
            entrant: { kind: "team", name: "blues", displayName: "The Blues" },
            puzzles: [
              step("riddle", 2, "In progress"),
              step("cipher", 0, "Unavailable"),
              step("finale", 0, "Unavailable"),
            ],
          },
        ],
      }) as never
    );
    show(<StaffQuest />, "/quest/trail", "/quest/:name");

    const blues = await screen.findByRole("region", {
      name: "The Blues (team)",
    });
    expect(screen.queryByText(/1st/)).not.toBeInTheDocument();
    const steps = within(
      within(blues).getByRole("list", { name: "Stops for The Blues (team)" })
    ).getAllByRole("listitem");
    expect(steps[0]).toHaveTextContent("Players here · In progress");
    expect(
      within(
        screen.getByRole("region", { name: "The Reds (team)" })
      ).getAllByRole("listitem")[1]
    ).toHaveTextContent("Players here · Awaiting activation");
  });

  it("puts the teams in a race in leaderboard order, with their ranks", async () => {
    const [reds] = withOneEntry(QUEST).entries;
    vi.spyOn(api, "GET").mockResolvedValue(
      ok({
        questName: "trail",
        displayName: "The Trail",
        entries: [
          reds,
          {
            ...reds,
            id: "entry-2",
            entrant: { kind: "team", name: "blues", displayName: "The Blues" },
            status: "completed",
            statusDescription: "Completed",
            rank: 1,
          },
        ],
      }) as never
    );
    show(<StaffQuest />, "/quest/trail", "/quest/:name");

    await screen.findByRole("region", { name: "The Blues (team)" });
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["The Blues (team)", "The Reds (team)"]);
    expect(
      screen.getByRole("region", { name: "The Blues (team)" })
    ).toHaveTextContent("1st · The Blues (team) · Completed");
  });

  it("says when there's no such quest", async () => {
    vi.spyOn(api, "GET").mockResolvedValue(
      refusal("not-found", "No quest") as never
    );
    show(<StaffQuest />, "/quest/missing", "/quest/:name");

    expect(
      await screen.findByRole("heading", { name: "Quest not found" })
    ).toBeVisible();
  });
});
