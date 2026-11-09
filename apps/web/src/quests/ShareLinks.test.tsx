import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { ok } from "../test/fakes";
import { ShareLinks } from "./ShareLinks";

const LINK = {
  id: "link-1",
  label: "Grandma",
  createdBy: "Pat",
  createdAt: "2026-11-01T00:00:00.000Z",
  expiresAt: "2026-12-01T12:00:00.000Z",
  canRevoke: true,
};

function apiWith(body: object) {
  vi.spyOn(api, "GET").mockResolvedValue(ok(body) as never);
}

function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ShareLinks questName="trail" />
    </QueryClientProvider>
  );
}

beforeEach(() => {
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

const CREATED = {
  id: "new",
  token: "secret",
  expiresAt: "2026-12-01T00:00:00.000Z",
};

/** Opens the section, once it has loaded. */
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Share this quest" })
  );
}

/** Opens the dialog and makes a link for the lobby. */
async function makeLink(user: ReturnType<typeof userEvent.setup>) {
  await open(user);
  await user.click(screen.getByRole("button", { name: "Make a link" }));
  const dialog = screen.getByRole("dialog", { name: "Make a link" });
  await user.type(within(dialog).getByLabelText("Who is it for?"), "Lobby");
  await user.click(
    within(dialog).getByRole("button", { name: "Make the link" })
  );
  return dialog;
}

describe("share links", () => {
  it("shows nothing for a public quest", async () => {
    const get = vi
      .spyOn(api, "GET")
      .mockResolvedValue(
        ok({ visibility: "public", canSetExpiry: false, links: [] }) as never
      );
    show();

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("starts closed, showing only its link", async () => {
    apiWith({ visibility: "private", canSetExpiry: false, links: [LINK] });
    show();

    const toggle = await screen.findByRole("button", {
      name: "Share this quest",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Grandma")).not.toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Make a link" })
    ).not.toBeInTheDocument();
  });

  it("opens and closes again", async () => {
    const user = userEvent.setup();
    apiWith({ visibility: "private", canSetExpiry: false, links: [LINK] });
    show();

    await open(user);
    const toggle = screen.getByRole("button", { name: "Share this quest" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Grandma")).toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Grandma")).not.toBeVisible();
  });

  it("lists the links and who made them", async () => {
    const user = userEvent.setup();
    apiWith({ visibility: "private", canSetExpiry: false, links: [LINK] });
    show();

    await open(user);

    expect(screen.getByText("Grandma")).toBeVisible();
    expect(screen.getByText(/made by Pat/)).toBeVisible();
  });

  it("says when there are no links yet", async () => {
    const user = userEvent.setup();
    apiWith({ visibility: "private", canSetExpiry: false, links: [] });
    show();

    await open(user);

    expect(screen.getByText("No links yet.")).toBeVisible();
  });

  it("offers revoking only where it's allowed", async () => {
    const user = userEvent.setup();
    apiWith({
      visibility: "private",
      canSetExpiry: false,
      links: [{ ...LINK, canRevoke: false }],
    });
    show();

    await open(user);
    expect(screen.queryByRole("button", { name: /Revoke/ })).toBeNull();
  });

  it("makes a link in a dialog, and shows its addresses once", async () => {
    const user = userEvent.setup();
    apiWith({ visibility: "private", canSetExpiry: false, links: [] });
    const post = vi
      .spyOn(api, "POST")
      .mockResolvedValue(ok(CREATED, 201) as never);
    show();

    const dialog = await makeLink(user);

    expect(
      await within(dialog).findByLabelText("Send them this link")
    ).toHaveValue(`${location.origin}/monitor/quest/trail#share=secret`);
    expect(within(dialog).getByLabelText("Board link")).toHaveValue(
      `${location.origin}/monitor/quest/trail/board#share=secret`
    );
    expect(post).toHaveBeenCalledWith("/quests/{name}/share-links", {
      params: { path: { name: "trail" } },
      body: { label: "Lobby" },
    });

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText("Send them this link")).toBeNull();
  });

  it("asks again from the start each time it's opened", async () => {
    const user = userEvent.setup();
    apiWith({ visibility: "private", canSetExpiry: false, links: [] });
    vi.spyOn(api, "POST").mockResolvedValue(ok(CREATED, 201) as never);
    show();

    const dialog = await makeLink(user);
    await within(dialog).findByLabelText("Send them this link");
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Make a link" }));

    expect(
      within(screen.getByRole("dialog")).getByLabelText("Who is it for?")
    ).toHaveValue("");
  });

  it("can be cancelled without making a link", async () => {
    const user = userEvent.setup();
    apiWith({ visibility: "private", canSetExpiry: false, links: [] });
    const post = vi.spyOn(api, "POST");
    show();

    await open(user);
    await user.click(screen.getByRole("button", { name: "Make a link" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      })
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("copies the address asked for", async () => {
    const user = userEvent.setup();
    apiWith({ visibility: "private", canSetExpiry: false, links: [] });
    vi.spyOn(api, "POST").mockResolvedValue(ok(CREATED, 201) as never);
    show();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    const dialog = await makeLink(user);
    await user.click(
      await within(dialog).findByRole("button", { name: "Copy board link" })
    );

    expect(writeText).toHaveBeenCalledWith(
      `${location.origin}/monitor/quest/trail/board#share=secret`
    );
    expect(
      within(dialog).getByRole("button", { name: "Copied" })
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Copy link" })
    ).toBeInTheDocument();
  });

  it("asks only staff when it should expire", async () => {
    const user = userEvent.setup();
    apiWith({ visibility: "private", canSetExpiry: false, links: [] });
    show();

    await open(user);
    await user.click(screen.getByRole("button", { name: "Make a link" }));

    expect(screen.getByLabelText("Who is it for?")).toBeInTheDocument();
    expect(screen.queryByLabelText("Expires on")).toBeNull();
  });

  it("asks staff when it should expire", async () => {
    const user = userEvent.setup();
    apiWith({ visibility: "private", canSetExpiry: true, links: [] });
    show();

    await open(user);
    await user.click(screen.getByRole("button", { name: "Make a link" }));

    expect(screen.getByLabelText("Expires on")).toBeInTheDocument();
  });

  it("asks before revoking", async () => {
    const user = userEvent.setup();
    apiWith({ visibility: "private", canSetExpiry: true, links: [LINK] });
    const remove = vi
      .spyOn(api, "DELETE")
      .mockResolvedValue(ok(undefined, 204) as never);
    show();

    await open(user);
    await user.click(screen.getByRole("button", { name: "Revoke Grandma" }));
    expect(remove).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Revoke",
      })
    );

    await waitFor(() => expect(remove).toHaveBeenCalled());
  });
});
