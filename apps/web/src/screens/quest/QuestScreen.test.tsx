import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { copy } from "../../copy";
import { questQueryKey } from "../../live/useLiveQuest";
import { ok, refusal, serverError, withOneEntry } from "../../test/fakes";
import { QuestScreen } from "./QuestScreen";

const live = vi.hoisted(() => ({ connected: false }));

// The share links panel has tests of its own.
vi.mock("../../quests/ShareLinksSection", () => ({
  ShareLinksSection: () => null,
}));

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

const COMPLETED_STEP = {
  puzzleName: "riddle",
  displayName: "The Riddle",
  status: "completed",
  statusDescription: "Completed",
  hintsRevealed: 0,
  skipped: false,
  startTime: "2026-11-06T18:00:00.000Z",
  activationTime: "2026-11-06T18:05:00.000Z",
  endTime: "2026-11-06T18:10:00.000Z",
  solutionText: "A piano",
  hints: [],
};

const WAITING_STEP = {
  puzzleName: "bridge",
  displayName: "The Bridge",
  status: "awaitingActivation",
  statusDescription: "Awaiting activation",
  hintsRevealed: 0,
  skipped: false,
  startTime: "2026-11-06T18:10:00.000Z",
  activationTime: null,
  endTime: null,
  hints: [],
};

const QUEST = {
  questName: "trail",
  displayName: "The Trail",
  status: "inProgress",
  statusDescription: "In progress",
  paused: false,
  puzzles: [COMPLETED_STEP, WAITING_STEP],
  progress: {
    ...STOPPED,
    elapsedMs: 600_000,
    totalMs: 600_000,
    startTime: "2026-11-06T18:00:00.000Z",
    puzzles: [
      {
        ...STOPPED,
        puzzleName: "riddle",
        elapsedMs: 600_000,
        totalMs: 600_000,
      },
      { ...STOPPED, puzzleName: "bridge" },
    ],
  },
};

/** The quest as its player gets it: with their own entry alone. */
function asPlayed(quest: typeof QUEST) {
  return withOneEntry(quest, {
    kind: "player",
    name: "player",
    displayName: "The Player",
  });
}

/** A finished entry, as the public view of a race shows it. */
function spectatorEntry(
  id: string,
  displayName: string,
  rank: number | null,
  status = "completed"
) {
  return {
    id,
    entrant: { kind: "team", displayName },
    status,
    statusDescription: status === "completed" ? "Completed" : "In progress",
    paused: false,
    rank,
    progress: {
      ...STOPPED,
      startTime: "2026-11-06T18:00:00.000Z",
      totalMs: rank === 1 ? 300_000 : 600_000,
      puzzles: [],
    },
    puzzles: [],
  };
}

/** The public view of the quest when the player's team played it alone. */
const ALONE = {
  questName: "trail",
  displayName: "The Trail",
  racing: false,
  stopsHidden: false,
  rivalsHidden: false,
  provisional: false,
  entries: [spectatorEntry("entry-1", "The Reds", 1)],
};

/**
 * Has the API answer with the player's quest, and its public view.
 * @param quest the quest, with the player's entry's progress beside it
 * @param spectated the quest's public view
 */
function apiAnswers(quest: typeof QUEST, spectated: unknown = ALONE) {
  return vi
    .spyOn(api, "GET")
    .mockImplementation((async (path: string) =>
      ok(
        path === "/quests/{questName}/spectator-view"
          ? spectated
          : asPlayed(quest)
      )) as never);
}

function show(
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/quest/trail"]}>
        <Routes>
          <Route path="/quest/:name" element={<QuestScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return client;
}

function stepOf(name: string) {
  const step = screen.getByRole("link", { name }).closest("li");
  if (!step) {
    throw new Error(`${name} isn't in a step`);
  }
  return within(step);
}

describe("QuestScreen", () => {
  beforeEach(() => {
    live.connected = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the quest the address names", async () => {
    const get = apiAnswers(QUEST);
    show();

    expect(
      await screen.findByRole("heading", { name: "The Trail", level: 1 })
    ).toBeVisible();
    expect(get).toHaveBeenCalledWith("/quests/{questName}", {
      params: { path: { questName: "trail" } },
    });
  });

  it("numbers each step reached, linking to its puzzle", async () => {
    apiAnswers(QUEST);
    show();

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(screen.getByRole("link", { name: "The Riddle" })).toHaveAttribute(
      "href",
      "/quest/trail/puzzle/riddle"
    );
    expect(stepOf("The Riddle").getByText(copy.stepLabel(1))).toBeVisible();
    expect(stepOf("The Bridge").getByText(copy.stepLabel(2))).toBeVisible();
  });

  it("says nothing of how long the quest is", async () => {
    apiAnswers(QUEST);
    show();

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(document.body.textContent).not.toMatch(/\bof\s+\d|\d\s*\/\s*\d/);
    expect(screen.queryByText(copy.questFinished)).not.toBeInTheDocument();
  });

  it("shows a solution only for a completed step", async () => {
    apiAnswers(QUEST);
    show();

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(stepOf("The Riddle").getByText("A piano")).toBeVisible();
    expect(
      stepOf("The Bridge").queryByText("Solution")
    ).not.toBeInTheDocument();
  });

  it("shows a skipped step as the API describes it", async () => {
    apiAnswers({
      ...QUEST,
      puzzles: [
        { ...COMPLETED_STEP, skipped: true, statusDescription: "Skipped" },
      ],
    });
    show();

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(stepOf("The Riddle").getByText("Skipped")).toBeVisible();
    expect(stepOf("The Riddle").getByText("A piano")).toBeVisible();
  });

  it("shows hint penalties, in the steps and in the quest's total", async () => {
    apiAnswers({
      ...QUEST,
      puzzles: [COMPLETED_STEP],
      progress: {
        ...QUEST.progress,
        penaltyMs: 60_000,
        totalMs: 660_000,
        puzzles: [
          {
            ...STOPPED,
            puzzleName: "riddle",
            elapsedMs: 600_000,
            penaltyMs: 60_000,
            totalMs: 660_000,
          },
        ],
      },
    });
    show();

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(
      screen.getByText("In progress, including 1:00 in hint penalties")
    ).toBeVisible();
    const step = stepOf("The Riddle");
    expect(step.getByText("Hint penalties")).toBeVisible();
    expect(step.getByText("1:00")).toBeVisible();
    expect(step.getByText("11:00")).toBeVisible();
  });

  it("leaves penalties out when there are none", async () => {
    apiAnswers(QUEST);
    show();

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(screen.queryByText(/hint penalties/i)).not.toBeInTheDocument();
  });

  it("says when the quest is paused", async () => {
    apiAnswers({ ...QUEST, paused: true });
    show();

    expect(
      await screen.findByText(/^Paused by the puzzle master/)
    ).toHaveTextContent("Paused by the puzzle master");
  });

  it("tells screen readers what changes while it's on screen", async () => {
    const get = apiAnswers({ ...QUEST, puzzles: [COMPLETED_STEP] });
    const client = show();
    await screen.findByRole("heading", { name: "The Trail", level: 1 });

    get.mockResolvedValue(ok(asPlayed(QUEST)) as never);
    await client.invalidateQueries({ queryKey: questQueryKey("trail") });

    await waitFor(() =>
      expect(document.querySelector("[data-announcement]")).toHaveTextContent(
        `${copy.stepLabel(2)} reached: The Bridge.`
      )
    );
  });

  it("marks the end only once the quest is over", async () => {
    apiAnswers({
      ...QUEST,
      status: "completed",
      statusDescription: "Completed",
    });
    show();

    expect(await screen.findByText(copy.questFinished)).toBeVisible();
  });

  it("shows the standings once the player's team has finished a race", async () => {
    const get = apiAnswers(
      { ...QUEST, status: "completed", statusDescription: "Completed" },
      {
        ...ALONE,
        racing: true,
        stopsHidden: true,
        provisional: true,
        entries: [
          spectatorEntry("entry-2", "The Blues", 1),
          spectatorEntry("entry-1", "The Reds", 2),
          spectatorEntry("entry-3", "The Greens", null, "inProgress"),
        ],
      }
    );
    show();

    const table = await screen.findByRole("table", { name: "Standings" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("1stThe BluesCompleted5:00");
    expect(rows[2]).toHaveTextContent("2ndThe Reds Your teamCompleted10:00");
    expect(rows[3]).toHaveTextContent("The GreensIn progress");
    expect(
      screen.getByText(/Provisional until every team finishes/)
    ).toBeVisible();
    expect(get).toHaveBeenCalledWith("/quests/{questName}/spectator-view", {
      params: { path: { questName: "trail" } },
    });
  });

  it("shows the final standings, with the winner, once everyone has finished", async () => {
    apiAnswers(
      { ...QUEST, status: "completed", statusDescription: "Completed" },
      {
        ...ALONE,
        entries: [
          spectatorEntry("entry-1", "The Reds", 1),
          spectatorEntry("entry-2", "The Blues", 2),
        ],
      }
    );
    show();

    const table = await screen.findByRole("table", { name: "Final standings" });
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "1stThe Reds Winner Your teamCompleted"
    );
    expect(screen.queryByText(/Provisional/)).not.toBeInTheDocument();
  });

  it("shows no standings for a quest the player's team played alone", async () => {
    const get = apiAnswers({
      ...QUEST,
      status: "completed",
      statusDescription: "Completed",
    });
    show();

    await screen.findByText(copy.questFinished);
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/quests/{questName}/spectator-view",
        expect.anything()
      )
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says nothing of rivals before the player's team finishes", async () => {
    const get = apiAnswers(QUEST);
    show();

    await screen.findByRole("link", { name: "The Riddle" });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalledWith(
      "/quests/{questName}/spectator-view",
      expect.anything()
    );
  });

  it("shows when live updates are connected", async () => {
    live.connected = true;
    apiAnswers(QUEST);
    show();

    await screen.findByRole("list", { name: copy.stepsReached });
    expect(
      document.querySelector('[data-live-updates="connected"]')
    ).not.toBeNull();
  });

  it("says so when the quest doesn't exist or isn't theirs", async () => {
    vi.spyOn(api, "GET").mockResolvedValue(
      refusal("not-found", "No such quest") as never
    );
    show();

    expect(
      await screen.findByRole("heading", { name: "Quest not available" })
    ).toBeVisible();
  });

  it("says so when the quest is reset while it's on screen", async () => {
    const get = apiAnswers(QUEST);
    const client = show();
    await screen.findByRole("heading", { name: "The Trail", level: 1 });

    get.mockResolvedValue(refusal("not-found", "No such quest") as never);
    await client.invalidateQueries({ queryKey: questQueryKey("trail") });

    expect(
      await screen.findByRole("heading", { name: "Quest not available" })
    ).toBeVisible();
  });

  it("keeps showing the last known state when the connection fails", async () => {
    const get = apiAnswers(QUEST);
    const client = show();
    await screen.findByRole("heading", { name: "The Trail", level: 1 });

    get.mockRejectedValue(new TypeError("Failed to fetch"));
    await client.invalidateQueries({ queryKey: questQueryKey("trail") });

    await waitFor(() =>
      expect(client.getQueryState(questQueryKey("trail"))?.status).toBe("error")
    );
    expect(
      screen.getByRole("heading", { name: "The Trail", level: 1 })
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says so when it has nothing to show and can't connect", async () => {
    vi.spyOn(api, "GET").mockRejectedValue(new TypeError("Failed to fetch"));
    show();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load this quest"
    );
  });

  it("treats other refusals as a failure to load", async () => {
    vi.spyOn(api, "GET").mockResolvedValue(serverError() as never);
    show();

    expect(await screen.findByRole("alert")).toBeVisible();
  });
});
