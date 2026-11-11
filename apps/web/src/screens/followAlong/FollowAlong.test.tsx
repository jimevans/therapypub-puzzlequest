import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { copy } from "../../copy";
import { ok, refusal, serverError, withOneEntry } from "../../test/fakes";
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

const STOPPED = {
  startTime: null,
  endTime: null,
  running: false,
  clockStart: null,
  elapsedMs: 0,
  penaltyMs: 0,
  totalMs: 0,
};

const SOLVED_STEP = {
  puzzleName: "riddle",
  displayName: "The Riddle",
  status: "completed",
  statusDescription: "Completed",
  skipped: false,
  activationTime: "2026-11-06T18:05:00.000Z",
  solutionText: "A piano",
};

const ACTIVE_STEP = {
  puzzleName: "lantern",
  displayName: "The Lantern",
  status: "inProgress",
  statusDescription: "In progress",
  skipped: false,
  activationTime: "2026-11-06T18:15:00.000Z",
  solutionText: null,
};

const WAITING_STEP = {
  puzzleName: "bridge",
  displayName: "The Bridge",
  status: "awaitingActivation",
  statusDescription: "Awaiting activation",
  skipped: false,
  activationTime: null,
  solutionText: null,
};

const QUEST = {
  questName: "trail",
  displayName: "The Trail",
  status: "inProgress",
  statusDescription: "In progress",
  paused: false,
  rank: null as number | null,
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
  quest: { questName: "trail", displayName: "The Trail", paused: false },
  puzzle: {
    puzzleName: "riddle",
    displayName: "The Riddle",
    status: "inProgress",
    statusDescription: "In progress",
    skipped: false,
    type: "text",
    text: "What has **keys**?",
    hints: [{ text: "It makes music", timePenaltySeconds: 60 }],
    solutionText: null,
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
const PUZZLE_PAGE = "/monitor/quest/trail/puzzle/riddle?entry=entry-1";

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
    const get = apiShows(spectated(QUEST));
    show(QUEST_PAGE);

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(get).toHaveBeenCalledWith("/quests/{questName}/spectator-view", {
      params: { path: { questName: "trail" } },
    });
  });

  it("numbers the steps reached, with nothing about how many are left", async () => {
    apiShows(spectated(QUEST));
    show(QUEST_PAGE);

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(stepNamed("The Riddle").getByText(copy.stepLabel(1))).toBeVisible();
    expect(stepNamed("The Bridge").getByText(copy.stepLabel(3))).toBeVisible();
    expect(document.body.textContent).not.toMatch(/\bof\s+\d|\d\s*\/\s*\d/);
  });

  it("links to activated puzzles' public pages only", async () => {
    apiShows(spectated(QUEST));
    show(QUEST_PAGE);

    expect(
      await screen.findByRole("link", { name: "The Lantern" })
    ).toHaveAttribute(
      "href",
      "/monitor/quest/trail/puzzle/lantern?entry=entry-1"
    );
    expect(screen.getByText("The Bridge")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "The Bridge" })
    ).not.toBeInTheDocument();
  });

  it("shows a solution only once solved", async () => {
    apiShows(spectated(QUEST));
    show(QUEST_PAGE);

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(stepNamed("The Riddle").getByText("A piano")).toBeVisible();
    expect(
      stepNamed("The Lantern").queryByText("Solution")
    ).not.toBeInTheDocument();
  });

  it("says when a quest hasn't started", async () => {
    apiShows(
      spectated({
        ...QUEST,
        status: "notStarted",
        statusDescription: "Not started",
        puzzles: [],
      })
    );
    show(QUEST_PAGE);

    expect(await screen.findByText(/hasn't started yet/)).toBeVisible();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("says when the quest is paused", async () => {
    apiShows(spectated({ ...QUEST, paused: true }));
    show(QUEST_PAGE);

    expect(
      await screen.findByText(/^Paused by the puzzle master/)
    ).toHaveTextContent("Paused by the puzzle master");
  });

  it("marks the end once the quest is over", async () => {
    apiShows(
      spectated({
        ...QUEST,
        status: "completed",
        progress: { ...QUEST.progress, totalMs: 3_845_000 },
      })
    );
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
    apiShows(spectated(QUEST));
    show(QUEST_PAGE);

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(
      document.querySelector('[data-live-updates="connected"]')
    ).not.toBeNull();
  });

  it("shows only the standings while a race is under way", async () => {
    const [reds] = spectated(QUEST).entries;
    apiShows({
      ...spectated(QUEST),
      racing: true,
      stopsHidden: true,
      entries: [
        { ...reds, puzzles: [], progress: { ...QUEST.progress, puzzles: [] } },
        {
          ...reds,
          id: "entry-2",
          entrant: { kind: "player", displayName: "Solo Sam" },
          status: "notStarted",
          statusDescription: "Not started",
          puzzles: [],
          progress: { ...STOPPED, puzzles: [] },
        },
      ],
    });
    show(QUEST_PAGE);

    const table = await screen.findByRole("table", { name: "Standings" });
    const rows = within(table).getAllByRole("row");
    expect(rows[0]).toHaveTextContent("RankTeam or playerStatusTime");
    expect(rows[1]).toHaveTextContent("Not ranked yetThe RedsIn progress10:00");
    expect(rows[2]).toHaveTextContent("Solo SamNot started–");
    expect(screen.getByText(copy.stopsHiddenInRace)).toBeVisible();
    expect(screen.queryByText(/Provisional/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: copy.stepsReached })
    ).not.toBeInTheDocument();
  });

  it("ranks those who have finished, provisionally, while others play", async () => {
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
          status: "completed",
          statusDescription: "Completed",
          rank: 1,
          puzzles: [],
          progress: {
            ...STOPPED,
            startTime: "2026-11-06T18:00:00.000Z",
            totalMs: 540_000,
            puzzles: [],
          },
        },
        { ...reds, puzzles: [], progress: { ...QUEST.progress, puzzles: [] } },
      ],
    });
    show(QUEST_PAGE);

    const table = await screen.findByRole("table", { name: "Standings" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("1stThe BluesCompleted9:00");
    expect(rows[2]).toHaveTextContent("The RedsIn progress10:00");
    expect(
      screen.getByText(/Provisional until every team finishes/)
    ).toBeVisible();
    expect(screen.queryByText("Winner")).not.toBeInTheDocument();
  });

  it("shows a player still racing only their own team, and says why", async () => {
    const [reds] = spectated(QUEST).entries;
    apiShows({
      ...spectated(QUEST),
      racing: true,
      stopsHidden: true,
      rivalsHidden: true,
      entries: [
        { ...reds, puzzles: [], progress: { ...QUEST.progress, puzzles: [] } },
      ],
    });
    show(QUEST_PAGE);

    const table = await screen.findByRole("table", { name: "Standings" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent("The Reds Your team");
    expect(
      screen.getByText(/the standings will show here once your team finishes/)
    ).toBeVisible();
    expect(screen.queryByText(copy.stopsHiddenInRace)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: copy.stepsReached })
    ).not.toBeInTheDocument();
  });

  it("shows the final standings, and each entry's stops, once every one has finished", async () => {
    const finished = spectated({
      ...QUEST,
      status: "completed",
      statusDescription: "Completed",
      rank: 2,
    });
    const [reds] = finished.entries;
    apiShows({
      ...finished,
      entries: [
        {
          ...reds,
          id: "entry-2",
          entrant: { kind: "team", displayName: "The Blues" },
          rank: 1,
        },
        reds,
      ],
    });
    show(QUEST_PAGE);

    const table = await screen.findByRole("table", { name: "Final standings" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("1stThe Blues WinnerCompleted");
    expect(rows[1]).toHaveAttribute("data-winner", "true");
    expect(rows[2]).toHaveTextContent("2ndThe RedsCompleted");
    expect(screen.queryByText(/Provisional/)).not.toBeInTheDocument();
    const blues = screen.getByRole("region", { name: "The Blues" });
    expect(
      within(blues).getByRole("heading", { name: "The Lantern", level: 3 })
    ).toBeVisible();
    expect(
      within(blues).getByRole("link", { name: "The Lantern" })
    ).toHaveAttribute(
      "href",
      "/monitor/quest/trail/puzzle/lantern?entry=entry-2"
    );
    expect(screen.getByRole("region", { name: "The Reds" })).toHaveTextContent(
      "The Reds finished in 10:00."
    );
    expect(
      screen.getAllByRole("list", { name: copy.stepsReached })
    ).toHaveLength(2);
  });

  it("says when there's no such quest", async () => {
    apiRefuses(refusal("not-found", "No such quest"));
    show(QUEST_PAGE);

    expect(
      await screen.findByRole("heading", { name: "Quest not available" })
    ).toBeVisible();
  });

  it("says when it can't load the quest", async () => {
    apiRefuses(serverError());
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
      "/quests/{questName}/puzzles/{puzzleName}/spectator-view",
      {
        params: {
          path: { questName: "trail", puzzleName: "riddle" },
          query: { entryId: "entry-1" },
        },
      }
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
      puzzle: {
        ...PUZZLE.puzzle,
        status: "completed",
        solutionText: "A piano",
      },
    });
    show(PUZZLE_PAGE);

    expect(await screen.findByText("A piano")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Solved" })).toBeVisible();
  });

  it("says when the quest is paused", async () => {
    apiShows({ ...PUZZLE, quest: { ...PUZZLE.quest, paused: true } });
    show(PUZZLE_PAGE);

    expect(
      await screen.findByText(/^Paused by the puzzle master/)
    ).toHaveTextContent("Paused");
  });

  it("needs to know whose progress to show", async () => {
    const get = apiShows(PUZZLE);
    show("/monitor/quest/trail/puzzle/riddle");

    expect(
      await screen.findByRole("heading", { name: "Puzzle not available" })
    ).toBeVisible();
    expect(get).not.toHaveBeenCalled();
  });

  it("says when the puzzle isn't available", async () => {
    apiRefuses(refusal("not-found", "No such quest"));
    show(PUZZLE_PAGE);

    expect(
      await screen.findByRole("heading", { name: "Puzzle not available" })
    ).toBeVisible();
  });

  it("says when it can't load the puzzle", async () => {
    apiRefuses(serverError());
    show(PUZZLE_PAGE);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load this puzzle"
    );
  });
});
