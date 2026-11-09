import { type FollowQuestOptions, followQuest } from "@puzzlequest/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { questQueryKey, useLiveQuest } from "./useLiveQuest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@puzzlequest/api-client", () => ({ followQuest: vi.fn() }));
vi.mock("../api", () => ({
  api: { POST: post },
  dataOrThrow: (result: { data: unknown }) => result.data,
}));

describe("useLiveQuest", () => {
  const stop = vi.fn();
  let client: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  /** The options of the most recent call to followQuest. */
  function followed(): FollowQuestOptions {
    const call = vi.mocked(followQuest).mock.lastCall;
    if (!call) {
      throw new Error("followQuest wasn't called");
    }
    return call[0];
  }

  beforeEach(() => {
    client = new QueryClient();
    stop.mockClear();
    vi.mocked(followQuest).mockReset();
    vi.mocked(followQuest).mockReturnValue({
      connectionId: () => "connection-1",
      stop,
    });
  });

  it("follows the quest at this site's address", () => {
    renderHook(() => useLiveQuest("trail"), { wrapper });

    expect(followed().questName).toBe("trail");
    expect(followed().url).toBe(`ws://${location.host}/api/v1/updates`);
  });

  it("gets each ticket for the quest it follows", async () => {
    post.mockResolvedValue({ data: { ticket: "ticket-1" } });
    renderHook(() => useLiveQuest("trail"), { wrapper });

    await expect(followed().getTicket()).resolves.toBe("ticket-1");

    expect(post).toHaveBeenCalledWith("/quests/{name}/live-tickets", {
      params: { path: { name: "trail" } },
    });
  });

  it("marks what's been fetched about the quest as out of date on a change", () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useLiveQuest("trail"), { wrapper });

    followed().onChange();

    expect(invalidate).toHaveBeenCalledExactlyOnceWith({
      queryKey: questQueryKey("trail"),
    });
  });

  it("leaves other quests' data alone", () => {
    client.setQueryData([...questQueryKey("trail"), "puzzle"], 1);
    client.setQueryData([...questQueryKey("other"), "puzzle"], 2);
    renderHook(() => useLiveQuest("trail"), { wrapper });

    followed().onChange();

    const isStale = (name: string) =>
      client.getQueryState([...questQueryKey(name), "puzzle"])?.isInvalidated;
    expect(isStale("trail")).toBe(true);
    expect(isStale("other")).toBe(false);
  });

  it("reports whether it's connected", () => {
    const { result } = renderHook(() => useLiveQuest("trail"), { wrapper });
    expect(result.current.connected).toBe(false);

    act(() => followed().onConnectionChange?.(true));
    expect(result.current.connected).toBe(true);

    act(() => followed().onConnectionChange?.(false));
    expect(result.current.connected).toBe(false);
  });

  it("gives the connection's ID for the screen's own actions", () => {
    const { result } = renderHook(() => useLiveQuest("trail"), { wrapper });

    expect(result.current.connectionId()).toBe("connection-1");
  });

  it("stops following when the screen goes away", () => {
    const { unmount } = renderHook(() => useLiveQuest("trail"), { wrapper });

    unmount();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("follows the new quest when the screen moves to another", () => {
    const { rerender } = renderHook(({ name }) => useLiveQuest(name), {
      wrapper,
      initialProps: { name: "trail" },
    });

    rerender({ name: "other" });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(followed().questName).toBe("other");
  });
});
