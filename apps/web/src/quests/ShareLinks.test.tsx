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

  it("lists the links and who made them", async () => {
    apiWith({ visibility: "private", canSetExpiry: false, links: [LINK] });
    show();

    expect(await screen.findByText("Grandma")).toBeInTheDocument();
    expect(screen.getByText(/made by Pat/)).toBeInTheDocument();
  });

  it("offers revoking only where it's allowed", async () => {
    apiWith({
      visibility: "private",
      canSetExpiry: false,
      links: [{ ...LINK, canRevoke: false }],
    });
    show();

    await screen.findByText("Grandma");
    expect(screen.queryByRole("button", { name: /Revoke/ })).toBeNull();
  });

  it("makes a link and shows its address once", async () => {
    const user = userEvent.setup();
    apiWith({ visibility: "private", canSetExpiry: false, links: [] });
    const post = vi
      .spyOn(api, "POST")
      .mockResolvedValue(
        ok(
          { id: "new", token: "secret", expiresAt: "2026-12-01T00:00:00.000Z" },
          201
        ) as never
      );
    show();

    await user.type(await screen.findByLabelText("Who is it for?"), "Lobby");
    await user.click(screen.getByRole("button", { name: "Make a link" }));

    expect(await screen.findByLabelText("Send them this link")).toHaveValue(
      `${location.origin}/monitor/quest/trail#share=secret`
    );
    expect(screen.getByLabelText("Board link")).toHaveValue(
      `${location.origin}/monitor/quest/trail/board#share=secret`
    );
    expect(post).toHaveBeenCalledWith("/quests/{name}/share-links", {
      params: { path: { name: "trail" } },
      body: { label: "Lobby" },
    });
  });

  it("copies the address asked for", async () => {
    const user = userEvent.setup();
    apiWith({ visibility: "private", canSetExpiry: false, links: [] });
    vi.spyOn(api, "POST").mockResolvedValue(
      ok(
        { id: "new", token: "secret", expiresAt: "2026-12-01T00:00:00.000Z" },
        201
      ) as never
    );
    show();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    await user.type(await screen.findByLabelText("Who is it for?"), "Lobby");
    await user.click(screen.getByRole("button", { name: "Make a link" }));
    await user.click(
      await screen.findByRole("button", { name: "Copy board link" })
    );

    expect(writeText).toHaveBeenCalledWith(
      `${location.origin}/monitor/quest/trail/board#share=secret`
    );
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy link" })
    ).toBeInTheDocument();
  });

  it("asks only staff when it should expire", async () => {
    apiWith({ visibility: "private", canSetExpiry: false, links: [] });
    show();

    await screen.findByLabelText("Who is it for?");
    expect(screen.queryByLabelText("Expires on")).toBeNull();
  });

  it("asks before revoking", async () => {
    const user = userEvent.setup();
    apiWith({ visibility: "private", canSetExpiry: true, links: [LINK] });
    const remove = vi
      .spyOn(api, "DELETE")
      .mockResolvedValue(ok(undefined, 204) as never);
    show();

    await user.click(
      await screen.findByRole("button", { name: "Revoke Grandma" })
    );
    expect(remove).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Revoke",
      })
    );

    await waitFor(() => expect(remove).toHaveBeenCalled());
  });
});
