import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { copy } from "../../copy";
import { ok, refusal, serverError, withOneEntry } from "../../test/fakes";
import { Board } from "./Board";

const live = vi.hoisted(() => ({ connected: true }));

vi.mock("../../live/useLiveQuest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../live/useLiveQuest")>()),
  useLiveQuest: () => ({
    connected: live.connected,
    connectionId: () => undefined,
  }),
}));

const STOPPED = { running: false, elapsedMs: 0, penaltyMs: 0, totalMs: 0 };

const SOLVED = {
  name: "riddle",
  displayName: "The Riddle",
  status: 3,
  statusDescription: "Completed",
  skipped: false,
  activationTime: "2026-11-06T18:05:00.000Z",
  solutionText: "A piano",
};

const WAITING = {
  name: "bridge",
  displayName: "The Bridge",
  status: 1,
  statusDescription: "Awaiting activation",
  skipped: false,
  activationTime: null,
  solutionText: null,
};

const QUEST = {
  name: "trail",
  displayName: "The Trail",
  status: 1,
  statusDescription: "In progress",
  paused: false,
  rank: null as number | null,
  puzzles: [SOLVED, WAITING],
  progress: {
    ...STOPPED,
    elapsedMs: 300_000,
    totalMs: 300_000,
    puzzles: [],
  },
};

/** The public view of a quest played by one team. */
function spectated(quest: typeof QUEST) {
  return {
    ...withOneEntry(quest, { kind: "team", displayName: "The Reds" }),
    racing: false,
    stopsHidden: false,
    rivalsHidden: false,
    provisional: false,
  };
}

function apiShows(data: unknown) {
  return vi.spyOn(api, "GET").mockResolvedValue(ok(data) as never);
}

function apiRefuses(answer: unknown) {
  vi.spyOn(api, "GET").mockResolvedValue(answer as never);
}

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/monitor/quest/trail/board"]}>
        <Routes>
          <Route path="/monitor/quest/:name/board" element={<Board />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Board", () => {
  beforeEach(() => {
    live.connected = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the public view of the quest", async () => {
    const get = apiShows(spectated(QUEST));
    show();

    await screen.findByRole("heading", { name: "The Trail" });
    expect(get).toHaveBeenCalledWith("/quests/{name}/spectator-view", {
      params: { path: { name: "trail" } },
    });
  });

  it("shows the clock, and the step the quest has reached", async () => {
    apiShows(spectated(QUEST));
    show();

    expect(await screen.findByText("5:00")).toBeVisible();
    expect(screen.getByText(copy.stepLabel(2))).toBeVisible();
    expect(screen.getByText(/The Bridge/)).toBeVisible();
    expect(screen.getByText("Awaiting activation")).toBeVisible();
  });

  it("doesn't give away a solution, or how long the quest is", async () => {
    apiShows(spectated(QUEST));
    show();

    await screen.findByText("5:00");
    expect(screen.queryByText("A piano")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bof\s+\d|\d\s*\/\s*\d/);
    expect(screen.queryByText(copy.questFinished)).not.toBeInTheDocument();
  });

  it("includes penalties in the clock, and says so", async () => {
    apiShows(
      spectated({
        ...QUEST,
        progress: { ...QUEST.progress, penaltyMs: 60_000, totalMs: 360_000 },
      })
    );
    show();

    expect(await screen.findByText("6:00")).toBeVisible();
    expect(screen.getByText(/including 1:00 in hint penalties/)).toBeVisible();
  });

  it("says when the quest is paused", async () => {
    apiShows(spectated({ ...QUEST, paused: true }));
    show();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Paused by the puzzle master"
    );
  });

  it("says when the quest hasn't started, with no clock", async () => {
    apiShows(spectated({ ...QUEST, status: 0, puzzles: [] }));
    show();

    expect(await screen.findByText("Starting soon")).toBeVisible();
    expect(screen.queryByText("0:00")).not.toBeInTheDocument();
  });

  it("marks the end, with the final time", async () => {
    apiShows(
      spectated({
        ...QUEST,
        status: 2,
        puzzles: [SOLVED],
        progress: { ...QUEST.progress, totalMs: 3_845_000 },
      })
    );
    show();

    expect(await screen.findByText(copy.questFinished)).toBeVisible();
    expect(screen.getByText("1:04:05")).toBeVisible();
  });

  it("shows the leaderboard during a race, provisional, with no stops", async () => {
    const [reds] = spectated(QUEST).entries;
    apiShows({
      ...spectated(QUEST),
      racing: true,
      stopsHidden: true,
      provisional: true,
      entries: [
        {
          ...reds,
          id: "entry-2",
          entrant: { kind: "team", displayName: "The Blues" },
          status: 2,
          statusDescription: "Completed",
          rank: 1,
          puzzles: [],
          progress: {
            ...QUEST.progress,
            startTime: "2026-11-06T18:00:00.000Z",
            totalMs: 240_000,
          },
        },
        {
          ...reds,
          paused: true,
          puzzles: [],
          progress: {
            ...QUEST.progress,
            startTime: "2026-11-06T18:00:00.000Z",
          },
        },
      ],
    });
    show();

    expect(
      await screen.findByRole("heading", { name: "The Trail", level: 1 })
    ).toBeVisible();
    const table = screen.getByRole("table", { name: "Standings" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("1stThe BluesCompleted4:00");
    expect(rows[2]).toHaveTextContent(
      "Not ranked yetThe RedsIn progress, paused5:00"
    );
    expect(
      screen.getByText(/Provisional until every team finishes/)
    ).toBeVisible();
    expect(screen.queryByText("Winner")).not.toBeInTheDocument();
    expect(screen.queryByText(/The Bridge/)).not.toBeInTheDocument();
  });

  it("keeps the final standings up once the race is over, with the winner", async () => {
    const [reds] = spectated({
      ...QUEST,
      status: 2,
      statusDescription: "Completed",
    }).entries;
    apiShows({
      ...spectated(QUEST),
      entries: [
        {
          ...reds,
          id: "entry-2",
          entrant: { kind: "team", displayName: "The Blues" },
          rank: 1,
        },
        { ...reds, rank: 2 },
      ],
    });
    show();

    const table = await screen.findByRole("table", { name: "Final standings" });
    const [, winner, second] = within(table).getAllByRole("row");
    expect(winner).toHaveTextContent("1stThe Blues WinnerCompleted");
    expect(winner).toHaveAttribute("data-winner", "true");
    expect(second).toHaveTextContent("2ndThe RedsCompleted");
    expect(second).not.toHaveAttribute("data-winner");
    expect(screen.queryByText(/Provisional/)).not.toBeInTheDocument();
  });

  it("says when the quest isn't available", async () => {
    apiRefuses(refusal("not-found", "No such quest"));
    show();

    expect(
      await screen.findByText("This quest isn't available.")
    ).toBeVisible();
  });

  it("says when it can't load anything", async () => {
    apiRefuses(serverError());
    show();

    expect(await screen.findByText(/Can't reach PuzzleQuest/)).toBeVisible();
  });

  it("says when it has lost its connection, keeping what it last knew", async () => {
    live.connected = false;
    apiShows(spectated(QUEST));
    show();

    expect(await screen.findByText("Reconnecting…")).toBeInTheDocument();
    expect(screen.getByText("5:00")).toBeVisible();
  });

  it("says nothing of the connection when it's fine", async () => {
    apiShows(spectated(QUEST));
    show();

    await screen.findByText("5:00");
    expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument();
  });
});
