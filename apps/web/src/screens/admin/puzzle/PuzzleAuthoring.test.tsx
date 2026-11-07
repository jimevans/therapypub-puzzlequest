import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api";
import { PuzzleDetails } from "./PuzzleDetails";
import { PuzzleEditor } from "./PuzzleEditor";

const RIDDLE = {
  name: "riddle",
  displayName: "The Riddle",
  type: 0,
  text: "Name a **color**",
  solutionKeyword: "red",
  solutionDisplayText: "Red",
  hints: [
    { text: "Roses", solutionWarning: false, timePenalty: 30 },
    { text: "It's red", solutionWarning: true, timePenalty: 300 },
  ],
};
const PICTURE = {
  ...RIDDLE,
  name: "picture",
  displayName: "The Picture",
  type: 1,
  text: "/puzzleData/picture.png",
  hints: [],
};

function ok(data?: unknown, status = 200) {
  return { data, response: new Response(null, { status }) };
}

function refusal(status: number, detail: string, errors?: object[]) {
  return {
    error: { title: "Refused", status, detail, errors },
    response: new Response(null, { status }),
  };
}

/** Has the API answer with these puzzles. */
function apiPuzzles(...puzzles: (typeof RIDDLE)[]) {
  return vi.spyOn(api, "GET").mockImplementation((async (
    path: string,
    init?: { params: { path: { name: string } } }
  ) => {
    const puzzle = puzzles.find(({ name }) => name === init?.params.path.name);
    return puzzle ? ok(puzzle) : refusal(404, "No such puzzle");
  }) as never);
}

function show(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/puzzles", element: <h1>Every puzzle</h1> },
      { path: "/puzzle/new", element: <PuzzleEditor /> },
      { path: "/puzzle/:name", element: <PuzzleDetails /> },
      { path: "/puzzle/:name/edit", element: <PuzzleEditor /> },
    ],
    { initialEntries: [path] }
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

beforeEach(() => {
  // jsdom has no modal dialogs, and no URLs for files.
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
  URL.createObjectURL = vi.fn(() => "blob:chosen-file");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a puzzle's details", () => {
  it("show its solution, content, and every hint", async () => {
    apiPuzzles(RIDDLE);
    show("/puzzle/riddle");

    expect(
      await screen.findByRole("heading", { name: "The Riddle" })
    ).toBeVisible();
    expect(screen.getByText("red")).toBeVisible();
    expect(await screen.findByText("color")).toHaveProperty(
      "tagName",
      "STRONG"
    );
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Roses30 sNo");
    expect(rows[2]).toHaveTextContent("It's red300 sYes");
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/puzzle/riddle/edit"
    );
  });

  it("show a media puzzle's file", async () => {
    apiPuzzles(PICTURE);
    show("/puzzle/picture");

    expect(
      await screen.findByRole("img", { name: "The Picture" })
    ).toHaveAttribute("src", "/puzzleData/picture.png");
    expect(screen.getByText("No hints.")).toBeVisible();
  });

  it("say when there's no such puzzle", async () => {
    apiPuzzles();
    show("/puzzle/missing");

    expect(
      await screen.findByRole("heading", { name: "Puzzle not found" })
    ).toBeVisible();
  });
});

describe("creating a puzzle", () => {
  it("previews the Markdown, and saves it with its hints", async () => {
    const user = userEvent.setup();
    apiPuzzles(RIDDLE);
    const post = vi.spyOn(api, "POST").mockResolvedValue(ok(RIDDLE, 201));
    const router = show("/puzzle/new");

    await user.type(await screen.findByLabelText("Name"), "riddle");
    await user.type(screen.getByLabelText("Display name"), "The Riddle");
    await user.type(screen.getByLabelText("Text"), "Name a **color**");
    const preview = screen.getByRole("region", { name: "As players see it" });
    expect(await within(preview).findByText("color")).toHaveProperty(
      "tagName",
      "STRONG"
    );
    await user.type(screen.getByLabelText(/Solution keywords/), "red");
    await user.type(screen.getByLabelText(/Solution as shown/), "Red");
    await user.click(screen.getByRole("button", { name: "Add hint" }));
    await user.type(screen.getByLabelText("Hint 1"), "Roses");
    await user.clear(screen.getByLabelText("Penalty (seconds)"));
    await user.type(screen.getByLabelText("Penalty (seconds)"), "30");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/puzzle/riddle")
    );
    expect(post).toHaveBeenCalledWith("/puzzles", {
      body: {
        name: "riddle",
        displayName: "The Riddle",
        type: 0,
        text: "Name a **color**",
        solutionKeyword: "red",
        solutionDisplayText: "Red",
        hints: [{ text: "Roses", solutionWarning: false, timePenalty: 30 }],
      },
    });
  });

  it("says what's missing, without saving", async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, "POST");
    show("/puzzle/new");

    await user.click(await screen.findByRole("button", { name: "Add hint" }));
    await user.clear(screen.getByLabelText("Penalty (seconds)"));
    await user.type(screen.getByLabelText("Penalty (seconds)"), "1.5");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter a name")).toBeVisible();
    expect(screen.getByText("Enter a display name")).toBeVisible();
    expect(screen.getByText("Enter the puzzle's text")).toBeVisible();
    expect(screen.getByText("Enter the hint")).toBeVisible();
    expect(screen.getByText("Enter whole seconds")).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the server's objection beside the field", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "POST").mockResolvedValue(
      refusal(409, "A puzzle named riddle already exists", [
        { path: "body.name", message: "Already taken" },
      ]) as never
    );
    show("/puzzle/new");

    await user.type(await screen.findByLabelText("Name"), "riddle");
    await user.type(screen.getByLabelText("Display name"), "The Riddle");
    await user.type(screen.getByLabelText("Text"), "Words");
    await user.type(screen.getByLabelText(/Solution keywords/), "red");
    await user.type(screen.getByLabelText(/Solution as shown/), "Red");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Already taken")).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("creates a media puzzle before uploading its file, which is named after it", async () => {
    const user = userEvent.setup();
    apiPuzzles(PICTURE);
    const post = vi
      .spyOn(api, "POST")
      .mockImplementation((async (path: string) =>
        path === "/puzzle-media"
          ? ok({ path: "/puzzleData/picture.png" }, 201)
          : ok(PICTURE, 201)) as never);
    const patch = vi
      .spyOn(api, "PATCH")
      .mockResolvedValue(ok(PICTURE) as never);
    const router = show("/puzzle/new");

    await user.type(await screen.findByLabelText("Name"), "picture");
    await user.type(screen.getByLabelText("Display name"), "The Picture");
    await user.selectOptions(screen.getByLabelText("Type"), "Image");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Choose a file")).toBeVisible();

    const file = new File(["png"], "Photo.PNG", { type: "image/png" });
    await user.upload(screen.getByLabelText("Choose the image"), file);
    expect(screen.getByRole("img", { name: "The Picture" })).toHaveAttribute(
      "src",
      "blob:chosen-file"
    );
    await user.type(screen.getByLabelText(/Solution keywords/), "blue");
    await user.type(screen.getByLabelText(/Solution as shown/), "Blue");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/puzzle/picture")
    );
    expect(post.mock.calls[0]).toEqual([
      "/puzzles",
      { body: expect.objectContaining({ name: "picture", type: 1, text: "" }) },
    ]);
    expect(post.mock.calls[1]?.[0]).toBe("/puzzle-media");
    const upload = (post.mock.calls[1]?.[1] as { body: FormData }).body;
    expect([...upload.keys()]).toEqual([
      "puzzleName",
      "fileExtension",
      "binary",
    ]);
    expect(upload.get("puzzleName")).toBe("picture");
    expect(upload.get("fileExtension")).toBe("PNG");
    expect(patch).toHaveBeenCalledWith("/puzzles/{name}", {
      params: { path: { name: "picture" } },
      body: { text: "/puzzleData/picture.png" },
    });
  });

  it("goes on to edit a new puzzle whose file couldn't be uploaded", async () => {
    const user = userEvent.setup();
    apiPuzzles(PICTURE);
    vi.spyOn(api, "POST").mockImplementation((async (path: string) =>
      path === "/puzzle-media"
        ? refusal(400, "Files of type .heic cannot be uploaded")
        : ok(PICTURE, 201)) as never);
    const router = show("/puzzle/new");

    await user.type(await screen.findByLabelText("Name"), "picture");
    await user.type(screen.getByLabelText("Display name"), "The Picture");
    await user.selectOptions(screen.getByLabelText("Type"), "Image");
    await user.upload(
      screen.getByLabelText("Choose the image"),
      new File(["heic"], "photo.heic", { type: "image/heic" })
    );
    await user.type(screen.getByLabelText(/Solution keywords/), "blue");
    await user.type(screen.getByLabelText(/Solution as shown/), "Blue");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/puzzle/picture/edit")
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The puzzle was created, but its file couldn't be uploaded: Files of type .heic cannot be uploaded"
    );
  });
});

describe("editing a puzzle", () => {
  it("keeps a media puzzle's file unless there's a new one", async () => {
    const user = userEvent.setup();
    apiPuzzles(PICTURE);
    const post = vi.spyOn(api, "POST");
    const patch = vi
      .spyOn(api, "PATCH")
      .mockResolvedValue(ok(PICTURE) as never);
    show("/puzzle/picture/edit");

    const displayName = await screen.findByLabelText("Display name");
    expect(screen.getByRole("img", { name: "The Picture" })).toHaveAttribute(
      "src",
      "/puzzleData/picture.png"
    );
    await user.clear(displayName);
    await user.type(displayName, "Renamed");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith("/puzzles/{name}", {
      params: { path: { name: "picture" } },
      body: expect.objectContaining({
        displayName: "Renamed",
        text: "/puzzleData/picture.png",
      }),
    });
    expect(post).not.toHaveBeenCalled();
  });

  it("needs a new file to change a media puzzle's type", async () => {
    const user = userEvent.setup();
    apiPuzzles(PICTURE);
    const patch = vi.spyOn(api, "PATCH");
    show("/puzzle/picture/edit");

    await user.selectOptions(await screen.findByLabelText("Type"), "Audio");
    expect(screen.getByText("No audio yet.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Choose a file")).toBeVisible();
    expect(patch).not.toHaveBeenCalled();
  });

  it("reorders and removes hints", async () => {
    const user = userEvent.setup();
    apiPuzzles(RIDDLE);
    const patch = vi.spyOn(api, "PATCH").mockResolvedValue(ok(RIDDLE) as never);
    show("/puzzle/riddle/edit");

    await user.click(
      await screen.findByRole("button", { name: "Move hint 2 up" })
    );
    expect(screen.getByLabelText("Hint 1")).toHaveValue("It's red");
    expect(screen.getByLabelText("Hint 2")).toHaveValue("Roses");
    await user.click(screen.getByRole("button", { name: "Remove hint 2" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith("/puzzles/{name}", {
      params: { path: { name: "riddle" } },
      body: expect.objectContaining({
        hints: [{ text: "It's red", solutionWarning: true, timePenalty: 300 }],
      }),
    });
  });

  it("asks before leaving unsaved changes, in the page", async () => {
    const user = userEvent.setup();
    apiPuzzles(RIDDLE);
    const router = show("/puzzle/riddle/edit");

    // Nothing's changed yet, so nothing's asked.
    await user.click(await screen.findByRole("link", { name: "Cancel" }));
    expect(router.state.location.pathname).toBe("/puzzle/riddle");
    await router.navigate("/puzzle/riddle/edit");

    await user.type(await screen.findByLabelText("Display name"), "!");
    await user.click(screen.getByRole("link", { name: "Cancel" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Leave without saving?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Keep editing" })
    );
    expect(router.state.location.pathname).toBe("/puzzle/riddle/edit");
    expect(screen.getByLabelText("Display name")).toHaveValue("The Riddle!");

    await user.click(screen.getByRole("link", { name: "Cancel" }));
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Leave without saving?" })
      ).getByRole("button", { name: "Leave" })
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/puzzle/riddle")
    );
  });
});
