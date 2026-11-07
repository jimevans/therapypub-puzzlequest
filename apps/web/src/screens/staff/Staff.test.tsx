import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import StaffHome from "./StaffHome";
import StaffQuest from "./StaffQuest";

vi.mock("../../live/useLiveQuest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../live/useLiveQuest")>()),
  useLiveQuest: () => ({ connected: true, connectionId: () => undefined }),
}));

const STOPPED = { running: false, elapsedMs: 0, penaltyMs: 0, totalMs: 0 };
const ASSIGNEE = { kind: "team", name: "reds", displayName: "The Reds" };

function step(name: string, status: number, statusDescription: string) {
  return {
    name,
    displayName: `The ${name}`,
    status,
    statusDescription,
    skipped: false,
    hintsRevealed: status === 3 ? 1 : 0,
    hintCount: 2,
    activationTime: status >= 2 ? "2026-11-07T10:03:00.000Z" : null,
    startTime: status >= 1 ? "2026-11-07T10:00:00.000Z" : null,
    endTime: status === 3 ? "2026-11-07T10:15:00.000Z" : null,
  };
}

const QUEST = {
  name: "trail",
  displayName: "The Trail",
  assignee: ASSIGNEE,
  status: 1,
  statusDescription: "In progress",
  paused: false,
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

function ok(data?: unknown) {
  return { data, response: new Response(null, { status: 200 }) };
}

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

describe("staff's home", () => {
  it("lists every quest, those under way first", async () => {
    vi.spyOn(api, "GET").mockResolvedValue(
      ok({
        items: [
          {
            ...QUEST,
            name: "done",
            displayName: "Done",
            status: 2,
            statusDescription: "Completed",
          },
          { ...QUEST, name: "later", displayName: "Later", status: 0 },
          QUEST,
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

describe("a quest, as staff follow it", () => {
  it("shows every stop in order, and where the players are", async () => {
    vi.spyOn(api, "GET").mockResolvedValue(ok(QUEST) as never);
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

  it("says when the quest is paused", async () => {
    vi.spyOn(api, "GET").mockResolvedValue(
      ok({ ...QUEST, paused: true }) as never
    );
    show(<StaffQuest />, "/quest/trail", "/quest/:name");

    expect(
      await screen.findByText(/Paused by the puzzle master/)
    ).toBeVisible();
  });

  it("says when there's no such quest", async () => {
    vi.spyOn(api, "GET").mockResolvedValue({
      error: { title: "Not found", status: 404, detail: "No quest" },
      response: new Response(null, { status: 404 }),
    } as never);
    show(<StaffQuest />, "/quest/missing", "/quest/:name");

    expect(
      await screen.findByRole("heading", { name: "Quest not found" })
    ).toBeVisible();
  });
});
