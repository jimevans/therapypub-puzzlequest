import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { copy } from "../../copy";
import { FollowPuzzle } from "./FollowPuzzle";
import { FollowQuest } from "./FollowQuest";

const live = vi.hoisted(() => ({ connected: false }));

vi.mock("../../live/useLiveQuest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../live/useLiveQuest")>()),
  useLiveQuest: () => ({
    connected: live.connected,
    connectionId: () => undefined,
  }),
}));

const STOPPED = { running: false, elapsedMs: 0, penaltyMs: 0, totalMs: 0 };

const SOLVED_STEP = {
  name: "riddle",
  displayName: "The Riddle",
  status: 3,
  statusDescription: "Completed",
  skipped: false,
  activationTime: "2026-11-06T18:05:00.000Z",
  solutionText: "A piano",
};

const ACTIVE_STEP = {
  name: "lantern",
  displayName: "The Lantern",
  status: 2,
  statusDescription: "In progress",
  skipped: false,
  activationTime: "2026-11-06T18:15:00.000Z",
  solutionText: null,
};

const WAITING_STEP = {
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
  puzzles: [SOLVED_STEP, ACTIVE_STEP, WAITING_STEP],
  progress: {
    ...STOPPED,
    elapsedMs: 600_000,
    totalMs: 600_000,
    startTime: "2026-11-06T18:00:00.000Z",
    puzzles: [
      { ...STOPPED, puzzleName: "riddle", endTime: "2026-11-06T18:10:00.000Z" },
      { ...STOPPED, puzzleName: "lantern" },
      { ...STOPPED, puzzleName: "bridge" },
    ],
  },
};

const PUZZLE = {
  quest: { name: "trail", displayName: "The Trail", paused: false },
  puzzle: {
    name: "riddle",
    displayName: "The Riddle",
    status: 2,
    statusDescription: "In progress",
    skipped: false,
    type: 0,
    text: "What has **keys**?",
    hints: [{ text: "It makes music", timePenalty: 60 }],
    solutionText: null,
  },
};

function apiShows(data: unknown) {
  return vi.spyOn(api, "GET").mockResolvedValue({
    data,
    response: new Response("{}", { status: 200 }),
  } as never);
}

function apiRefuses(status: number) {
  vi.spyOn(api, "GET").mockResolvedValue({
    error: { title: "Refused", status },
    response: new Response("{}", { status }),
  } as never);
}

function show(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/monitor/quest/:name" element={<FollowQuest />} />
          <Route
            path="/monitor/quest/:name/puzzle/:puzzleName"
            element={<FollowPuzzle />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const QUEST_PAGE = "/monitor/quest/trail";
const PUZZLE_PAGE = "/monitor/quest/trail/puzzle/riddle";

function stepNamed(name: string) {
  const step = screen.getByText(name).closest("li");
  if (!step) {
    throw new Error(`${name} isn't in a step`);
  }
  return within(step);
}

describe("following a quest", () => {
  beforeEach(() => {
    live.connected = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the public view, not the player's", async () => {
    const get = apiShows(QUEST);
    show(QUEST_PAGE);

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(get).toHaveBeenCalledWith("/quests/{name}/spectator-view", {
      params: { path: { name: "trail" } },
    });
  });

  it("numbers the steps reached, with nothing about how many are left", async () => {
    apiShows(QUEST);
    show(QUEST_PAGE);

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(stepNamed("The Riddle").getByText(copy.stepLabel(1))).toBeVisible();
    expect(stepNamed("The Bridge").getByText(copy.stepLabel(3))).toBeVisible();
    expect(document.body.textContent).not.toMatch(/\bof\s+\d|\d\s*\/\s*\d/);
  });

  it("links to activated puzzles' public pages only", async () => {
    apiShows(QUEST);
    show(QUEST_PAGE);

    expect(
      await screen.findByRole("link", { name: "The Lantern" })
    ).toHaveAttribute("href", "/monitor/quest/trail/puzzle/lantern");
    expect(screen.getByText("The Bridge")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "The Bridge" })
    ).not.toBeInTheDocument();
  });

  it("shows a solution only once solved", async () => {
    apiShows(QUEST);
    show(QUEST_PAGE);

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(stepNamed("The Riddle").getByText("A piano")).toBeVisible();
    expect(
      stepNamed("The Lantern").queryByText("Solution")
    ).not.toBeInTheDocument();
  });

  it("says when a quest hasn't started", async () => {
    apiShows({
      ...QUEST,
      status: 0,
      statusDescription: "Not started",
      puzzles: [],
    });
    show(QUEST_PAGE);

    expect(await screen.findByText(/hasn't started yet/)).toBeVisible();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("says when the quest is paused", async () => {
    apiShows({ ...QUEST, paused: true });
    show(QUEST_PAGE);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Paused by the puzzle master"
    );
  });

  it("marks the end once the quest is over", async () => {
    apiShows({
      ...QUEST,
      status: 2,
      progress: { ...QUEST.progress, totalMs: 3_845_000 },
    });
    show(QUEST_PAGE);

    expect(
      await screen.findByRole("heading", { name: copy.questFinished })
    ).toBeVisible();
    expect(screen.getByText(/finished in/)).toHaveTextContent(
      "The Trail finished in 1:04:05."
    );
  });

  it("shows when live updates are connected", async () => {
    live.connected = true;
    apiShows(QUEST);
    show(QUEST_PAGE);

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(
      document.querySelector('[data-live-updates="connected"]')
    ).not.toBeNull();
  });

  it("says when there's no such quest", async () => {
    apiRefuses(404);
    show(QUEST_PAGE);

    expect(
      await screen.findByRole("heading", { name: "Quest not available" })
    ).toBeVisible();
  });

  it("says when it can't load the quest", async () => {
    apiRefuses(500);
    show(QUEST_PAGE);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load this quest"
    );
  });
});

describe("following a puzzle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows what it asks, and the hints revealed, read-only", async () => {
    const get = apiShows(PUZZLE);
    show(PUZZLE_PAGE);

    expect(await screen.findByText("keys")).toContainHTML(
      "<strong>keys</strong>"
    );
    expect(screen.getByText("It makes music")).toBeVisible();
    expect(screen.getByText("Hint 1, +1:00")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/quests/{name}/puzzles/{puzzleName}/spectator-view",
      { params: { path: { name: "trail", puzzleName: "riddle" } } }
    );
  });

  it("links back to following the quest", async () => {
    apiShows(PUZZLE);
    show(PUZZLE_PAGE);

    expect(
      await screen.findByRole("link", { name: "The Trail" })
    ).toHaveAttribute("href", QUEST_PAGE);
  });

  it("keeps the solution back until it's solved", async () => {
    apiShows(PUZZLE);
    show(PUZZLE_PAGE);

    await screen.findByRole("heading", { name: "The Riddle", level: 1 });
    expect(
      screen.queryByRole("heading", { name: "Solved" })
    ).not.toBeInTheDocument();
  });

  it("shows the solution once solved", async () => {
    apiShows({
      ...PUZZLE,
      puzzle: { ...PUZZLE.puzzle, status: 3, solutionText: "A piano" },
    });
    show(PUZZLE_PAGE);

    expect(await screen.findByText("A piano")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Solved" })).toBeVisible();
  });

  it("says when the quest is paused", async () => {
    apiShows({ ...PUZZLE, quest: { ...PUZZLE.quest, paused: true } });
    show(PUZZLE_PAGE);

    expect(await screen.findByRole("status")).toHaveTextContent("Paused");
  });

  it("says when the puzzle isn't available", async () => {
    apiRefuses(404);
    show(PUZZLE_PAGE);

    expect(
      await screen.findByRole("heading", { name: "Puzzle not available" })
    ).toBeVisible();
  });

  it("says when it can't load the puzzle", async () => {
    apiRefuses(500);
    show(PUZZLE_PAGE);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load this puzzle"
    );
  });
});
