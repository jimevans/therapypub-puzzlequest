import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { copy } from "../../copy";
import { questQueryKey } from "../../live/useLiveQuest";
import { PuzzleScreen } from "./PuzzleScreen";

vi.mock("../../live/useLiveQuest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../live/useLiveQuest")>()),
  useLiveQuest: () => ({
    connected: true,
    connectionId: () => "connection-1",
  }),
}));

const PATHS = { params: { path: { name: "trail", puzzleName: "riddle" } } };
const PROGRESS = {
  running: false,
  elapsedMs: 300_000,
  penaltyMs: 0,
  totalMs: 300_000,
  puzzles: [],
};

function viewOf(puzzle = {}, rest = {}) {
  return {
    quest: {
      name: "trail",
      displayName: "The Trail",
      status: 1,
      statusDescription: "In progress",
      paused: false,
      progress: PROGRESS,
    },
    puzzle: {
      name: "riddle",
      displayName: "The Riddle",
      status: 2,
      statusDescription: "In progress",
      skipped: false,
      stopNumber: 2,
      type: 0,
      text: "What has **keys**?",
      hints: [],
      nextHint: null,
      solutionText: null,
      ...puzzle,
    },
    next: null,
    ...rest,
  };
}

const AWAITING = { status: 1, type: null, text: null };
const SOLVED = { status: 3, solutionText: "A piano" };

function ok(data: unknown) {
  return { data, response: new Response("{}", { status: 200 }) };
}

function refusal(status: number, detail: string) {
  return {
    error: { title: "Refused", status, detail },
    response: new Response("{}", { status }),
  };
}

function apiShows(view: unknown) {
  return vi.spyOn(api, "GET").mockResolvedValue(ok(view) as never);
}

function apiAnswersAction(answer: unknown) {
  return vi.spyOn(api, "POST").mockResolvedValue(answer as never);
}

function show(path = "/quest/trail/puzzle/riddle") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/quest/:name/puzzle/:puzzleName"
            element={<PuzzleScreen />}
          />
          <Route path="/quest/:name" element={<h1>The quest screen</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return client;
}

async function shown() {
  await screen.findByRole("heading", { name: "The Riddle", level: 1 });
}

describe("PuzzleScreen", () => {
  beforeEach(() => {
    // jsdom has no modal dialogs.
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement
    ) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement
    ) {
      this.open = false;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("always", () => {
    it("fetches the puzzle the address names", async () => {
      const get = apiShows(viewOf());
      show();

      await shown();
      expect(get).toHaveBeenCalledWith(
        "/quests/{name}/puzzles/{puzzleName}",
        PATHS
      );
    });

    it("says which step it is, with nothing about how many are left", async () => {
      apiShows(viewOf());
      show();

      await shown();
      expect(screen.getByText(copy.stepLabel(2))).toBeVisible();
      expect(document.body.textContent).not.toMatch(/\bof\s+\d|\d\s*\/\s*\d/);
    });

    it("links back to the quest, and shows its clock", async () => {
      apiShows(viewOf());
      show();

      await shown();
      expect(screen.getByRole("link", { name: "The Trail" })).toHaveAttribute(
        "href",
        "/quest/trail"
      );
      expect(screen.getByText("5:00")).toBeVisible();
    });

    it("says when the puzzle isn't available", async () => {
      vi.spyOn(api, "GET").mockResolvedValue(
        refusal(404, "No puzzle") as never
      );
      show();

      expect(
        await screen.findByRole("heading", { name: "Puzzle not available" })
      ).toBeVisible();
    });

    it("keeps the last known state when the connection fails", async () => {
      const get = apiShows(viewOf());
      const client = show();
      await shown();

      get.mockRejectedValue(new TypeError("Failed to fetch"));
      await client.invalidateQueries({ queryKey: questQueryKey("trail") });

      await shown();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("says so when it has nothing to show and can't connect", async () => {
      vi.spyOn(api, "GET").mockRejectedValue(new TypeError("Failed to fetch"));
      show();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Couldn't load this puzzle"
      );
    });
  });

  describe("awaiting activation", () => {
    it("sends the code typed, without its surrounding spaces", async () => {
      apiShows(viewOf(AWAITING));
      const post = apiAnswersAction(ok({ activationTime: "now" }));
      show();

      await userEvent.type(
        await screen.findByLabelText("Activation code"),
        " bridge-code "
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Start this puzzle" })
      );

      await waitFor(() =>
        expect(post).toHaveBeenCalledWith(
          "/quests/{name}/puzzles/{puzzleName}/activation",
          { ...PATHS, body: { activationCode: "bridge-code" } }
        )
      );
    });

    it("moves on to the puzzle once activated", async () => {
      const get = apiShows(viewOf(AWAITING));
      apiAnswersAction(ok({ activationTime: "now" }));
      show();

      await userEvent.type(
        await screen.findByLabelText("Activation code"),
        "code"
      );
      get.mockResolvedValue(ok(viewOf()) as never);
      await userEvent.click(
        screen.getByRole("button", { name: "Start this puzzle" })
      );

      expect(await screen.findByLabelText("Your answer")).toBeVisible();
    });

    it("says why a code was refused, and stays", async () => {
      apiShows(viewOf(AWAITING));
      apiAnswersAction(refusal(422, "Incorrect activation code for puzzle"));
      show();

      await userEvent.type(
        await screen.findByLabelText("Activation code"),
        "wrong"
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Start this puzzle" })
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Incorrect activation code for puzzle"
      );
      expect(screen.getByLabelText("Activation code")).toHaveValue("wrong");
    });

    it("asks for a code rather than sending nothing", async () => {
      apiShows(viewOf(AWAITING));
      const post = apiAnswersAction(ok({}));
      show();

      await screen.findByLabelText("Activation code");
      await userEvent.click(
        screen.getByRole("button", { name: "Start this puzzle" })
      );

      expect(await screen.findByText("Enter the code")).toBeVisible();
      expect(post).not.toHaveBeenCalled();
    });

    it("waits while the quest is paused", async () => {
      apiShows(viewOf(AWAITING, { quest: pausedQuest() }));
      show();

      expect(await screen.findByLabelText("Activation code")).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Start this puzzle" })
      ).toBeDisabled();
      expect(screen.getByRole("status")).toHaveTextContent("Paused");
    });
  });

  describe("in progress", () => {
    it("renders a text puzzle's Markdown", async () => {
      apiShows(viewOf());
      show();

      expect(await screen.findByText("keys")).toContainHTML(
        "<strong>keys</strong>"
      );
    });

    it("renders GitHub-style tables", async () => {
      apiShows(viewOf({ text: "| a |\n|---|\n| b |" }));
      show();

      expect(await screen.findByRole("table")).toBeVisible();
    });

    it("shows HTML in the Markdown as text, rather than running it", async () => {
      apiShows(viewOf({ text: 'Before <img src=x onerror="alert(1)"> after' }));
      show();

      await screen.findByText(/Before/);
      expect(document.querySelector("#puzzle-content img")).toBeNull();
    });

    it("drops script links from the Markdown", async () => {
      apiShows(viewOf({ text: "[click](javascript:alert(1))" }));
      show();

      const link = await screen.findByText("click");
      expect(link.getAttribute("href") ?? "").not.toContain("javascript");
    });

    it("shows an image puzzle", async () => {
      apiShows(viewOf({ type: 1, text: "/puzzleData/a.png" }));
      show();

      expect(
        await screen.findByRole("img", { name: "The Riddle" })
      ).toHaveAttribute("src", "/puzzleData/a.png");
    });

    it("gives an audio puzzle controls, so it can be played", async () => {
      apiShows(viewOf({ type: 2, text: "/puzzleData/a.mp3" }));
      show();

      await shown();
      const audio = document.querySelector("audio");
      expect(audio).toHaveAttribute("src", "/puzzleData/a.mp3");
      expect(audio).toHaveAttribute("controls");
    });

    it("plays a video puzzle in the page, with controls", async () => {
      apiShows(viewOf({ type: 3, text: "/puzzleData/a.mp4" }));
      show();

      await shown();
      const video = document.querySelector("video");
      expect(video).toHaveAttribute("playsinline");
      expect(video).toHaveAttribute("controls");
    });

    it("sends a guess, with the live connection, and shows the solution", async () => {
      const get = apiShows(viewOf());
      const post = apiAnswersAction(ok({}));
      show();

      await userEvent.type(
        await screen.findByLabelText("Your answer"),
        "a piano"
      );
      get.mockResolvedValue(ok(viewOf(SOLVED)) as never);
      await userEvent.click(
        screen.getByRole("button", { name: "Check answer" })
      );

      expect(await screen.findByText("A piano")).toBeVisible();
      expect(post).toHaveBeenCalledWith(
        "/quests/{name}/puzzles/{puzzleName}/solution-attempts",
        { ...PATHS, body: { guess: "a piano", connectionId: "connection-1" } }
      );
    });

    it("says when a guess is wrong, and keeps it to correct", async () => {
      apiShows(viewOf());
      apiAnswersAction(refusal(422, "Incorrect guess for puzzle solution"));
      show();

      await userEvent.type(
        await screen.findByLabelText("Your answer"),
        "organ"
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Check answer" })
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Incorrect guess for puzzle solution"
      );
      expect(screen.getByLabelText("Your answer")).toHaveValue("organ");
    });

    it("says when it can't reach the server", async () => {
      apiShows(viewOf());
      vi.spyOn(api, "POST").mockRejectedValue(new TypeError("Failed to fetch"));
      show();

      await userEvent.type(await screen.findByLabelText("Your answer"), "x");
      await userEvent.click(
        screen.getByRole("button", { name: "Check answer" })
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Couldn't reach the server"
      );
    });

    it("catches up when a teammate got there first", async () => {
      const get = apiShows(viewOf());
      apiAnswersAction(refusal(409, "The puzzle isn't in progress"));
      show();

      await userEvent.type(await screen.findByLabelText("Your answer"), "x");
      get.mockResolvedValue(ok(viewOf(SOLVED)) as never);
      await userEvent.click(
        screen.getByRole("button", { name: "Check answer" })
      );

      expect(await screen.findByText("A piano")).toBeVisible();
    });

    it("shows the hints revealed, and their penalties", async () => {
      apiShows(
        viewOf({
          hints: [
            { text: "It makes music", timePenalty: 60 },
            { text: "It's free", timePenalty: 0 },
          ],
        })
      );
      show();

      expect(await screen.findByText("It makes music")).toBeVisible();
      expect(screen.getByText("Hint 1, +1:00")).toBeVisible();
      expect(screen.getByText("Hint 2")).toBeVisible();
    });

    it("says what the next hint costs, and reveals it at once", async () => {
      const post = apiAnswersAction(ok({}));
      apiShows(
        viewOf({ nextHint: { timePenalty: 90, solutionWarning: false } })
      );
      show();

      await userEvent.click(
        await screen.findByRole("button", { name: "Reveal next hint (+1:30)" })
      );

      await waitFor(() =>
        expect(post).toHaveBeenCalledWith(
          "/quests/{name}/puzzles/{puzzleName}/hints",
          { ...PATHS, body: { connectionId: "connection-1" } }
        )
      );
    });

    it("offers no hint when there are none left", async () => {
      apiShows(viewOf());
      show();

      await shown();
      expect(
        screen.queryByRole("button", { name: /Reveal next hint/ })
      ).not.toBeInTheDocument();
    });

    describe("a hint that gives away the solution", () => {
      async function askForIt() {
        const post = apiAnswersAction(ok({}));
        apiShows(
          viewOf({ nextHint: { timePenalty: 300, solutionWarning: true } })
        );
        show();
        await userEvent.click(
          await screen.findByRole("button", { name: /Reveal next hint/ })
        );
        return post;
      }

      it("warns first", async () => {
        const post = await askForIt();

        expect(
          screen.getByRole("heading", { name: "Give away the solution?" })
        ).toBeVisible();
        expect(post).not.toHaveBeenCalled();
      });

      it("isn't revealed if the player keeps trying", async () => {
        const post = await askForIt();

        await userEvent.click(
          screen.getByRole("button", { name: "Keep trying" })
        );

        expect(HTMLDialogElement.prototype.close).toHaveBeenCalled();
        expect(post).not.toHaveBeenCalled();
      });

      it("is revealed once the player agrees", async () => {
        const post = await askForIt();

        await userEvent.click(screen.getByRole("button", { name: "Show it" }));

        await waitFor(() => expect(post).toHaveBeenCalled());
      });
    });

    it("stops the player while the quest is paused", async () => {
      apiShows(
        viewOf(
          { nextHint: { timePenalty: 60, solutionWarning: false } },
          { quest: pausedQuest() }
        )
      );
      show();

      expect(await screen.findByLabelText("Your answer")).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Check answer" })
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /Reveal next hint/ })
      ).toBeDisabled();
      expect(screen.getByRole("status")).toHaveTextContent("Paused");
    });
  });

  describe("completed", () => {
    it("shows the solution, with nowhere to type", async () => {
      apiShows(viewOf(SOLVED));
      show();

      expect(await screen.findByText("A piano")).toBeVisible();
      expect(screen.getByRole("heading", { name: "Solved" })).toBeVisible();
      expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
    });

    it("says when the puzzle master skipped it", async () => {
      apiShows(viewOf({ ...SOLVED, skipped: true }));
      show();

      expect(
        await screen.findByRole("heading", { name: "Skipped" })
      ).toBeVisible();
      expect(screen.getByText("A piano")).toBeVisible();
    });

    it("links on to the next puzzle", async () => {
      apiShows(
        viewOf(SOLVED, { next: { name: "a/b", displayName: "The Bridge" } })
      );
      show();

      expect(
        await screen.findByRole("link", {
          name: copy.goToNextStep("The Bridge"),
        })
      ).toHaveAttribute("href", "/quest/trail/puzzle/a%2Fb");
      expect(screen.queryByText(copy.questFinished)).not.toBeInTheDocument();
    });

    it("waits quietly if the next puzzle hasn't arrived yet", async () => {
      apiShows(viewOf(SOLVED));
      show();

      await screen.findByText("A piano");
      expect(screen.queryByText(copy.questFinished)).not.toBeInTheDocument();
    });

    it("celebrates the end of the quest, with the final time", async () => {
      apiShows(
        viewOf(SOLVED, {
          quest: {
            name: "trail",
            displayName: "The Trail",
            status: 2,
            statusDescription: "Completed",
            paused: false,
            progress: { ...PROGRESS, totalMs: 3_845_000 },
          },
        })
      );
      show();

      expect(
        await screen.findByRole("heading", { name: copy.questFinished })
      ).toBeVisible();
      expect(screen.getAllByText("1:04:05").length).toBeGreaterThan(0);
    });
  });
});

function pausedQuest() {
  return {
    name: "trail",
    displayName: "The Trail",
    status: 1,
    statusDescription: "Paused",
    paused: true,
    progress: PROGRESS,
  };
}
