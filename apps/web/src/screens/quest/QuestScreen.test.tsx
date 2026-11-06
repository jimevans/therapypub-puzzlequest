import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { copy } from "../../copy";
import { questQueryKey } from "../../live/useLiveQuest";
import { QuestScreen } from "./QuestScreen";

const live = vi.hoisted(() => ({ connected: false }));

vi.mock("../../live/useLiveQuest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../live/useLiveQuest")>()),
  useLiveQuest: () => ({
    connected: live.connected,
    connectionId: () => undefined,
  }),
}));

const STOPPED = { running: false, elapsedMs: 0, penaltyMs: 0, totalMs: 0 };

const COMPLETED_STEP = {
  puzzleName: "riddle",
  displayName: "The Riddle",
  status: 3,
  statusDescription: "Completed",
  nextHintToDisplay: 0,
  skipped: false,
  startTime: "2026-11-06T18:00:00.000Z",
  activationTime: "2026-11-06T18:05:00.000Z",
  endTime: "2026-11-06T18:10:00.000Z",
  solutionDisplayText: "A piano",
};

const WAITING_STEP = {
  puzzleName: "bridge",
  displayName: "The Bridge",
  status: 1,
  statusDescription: "Awaiting activation",
  nextHintToDisplay: 0,
  skipped: false,
  startTime: "2026-11-06T18:10:00.000Z",
};

const QUEST = {
  name: "trail",
  displayName: "The Trail",
  assignee: { kind: "user", id: "1" },
  status: 1,
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

function apiAnswers(data: unknown) {
  return vi.spyOn(api, "GET").mockResolvedValue({
    data,
    response: new Response("{}", { status: 200 }),
  } as never);
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
    expect(get).toHaveBeenCalledWith("/quests/{name}", {
      params: { path: { name: "trail" } },
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

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Paused by the puzzle master"
    );
  });

  it("marks the end only once the quest is over", async () => {
    apiAnswers({ ...QUEST, status: 2, statusDescription: "Completed" });
    show();

    expect(await screen.findByText(copy.questFinished)).toBeVisible();
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
    vi.spyOn(api, "GET").mockResolvedValue({
      error: { title: "Not found", status: 404 },
      response: new Response("{}", { status: 404 }),
    } as never);
    show();

    expect(
      await screen.findByRole("heading", { name: "Quest not available" })
    ).toBeVisible();
  });

  it("says so when the quest is reset while it's on screen", async () => {
    const get = apiAnswers(QUEST);
    const client = show();
    await screen.findByRole("heading", { name: "The Trail", level: 1 });

    get.mockResolvedValue({
      error: { title: "Not found", status: 404 },
      response: new Response("{}", { status: 404 }),
    } as never);
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
    vi.spyOn(api, "GET").mockResolvedValue({
      error: { title: "Server error", status: 500 },
      response: new Response("{}", { status: 500 }),
    } as never);
    show();

    expect(await screen.findByRole("alert")).toBeVisible();
  });
});
