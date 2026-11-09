import {
  type FollowUserQuestsOptions,
  followUserQuests,
} from "@puzzlequest/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveUserQuests, userQuestsQueryKey } from "./useLiveUserQuests";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@puzzlequest/api-client", () => ({ followUserQuests: vi.fn() }));
vi.mock("../api", () => ({
  api: { POST: post },
  dataOrThrow: (result: { data: unknown }) => result.data,
}));

describe("useLiveUserQuests", () => {
  const stop = vi.fn();
  let client: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  /** The options of the most recent call to followUserQuests. */
  function followed(): FollowUserQuestsOptions {
    const call = vi.mocked(followUserQuests).mock.lastCall;
    if (!call) {
      throw new Error("followUserQuests wasn't called");
    }
    return call[0];
  }

  beforeEach(() => {
    client = new QueryClient();
    stop.mockClear();
    vi.mocked(followUserQuests).mockReset();
    vi.mocked(followUserQuests).mockReturnValue({ stop });
  });

  it("follows the user's quests at this site's address", () => {
    renderHook(() => useLiveUserQuests("pat"), { wrapper });

    expect(followed().userName).toBe("pat");
    expect(followed().url).toBe(`ws://${location.host}/api/v1/updates`);
  });

  it("follows nothing without a user", () => {
    renderHook(() => useLiveUserQuests(undefined), { wrapper });

    expect(followUserQuests).not.toHaveBeenCalled();
  });

  it("gets each ticket for the user", async () => {
    post.mockResolvedValue({ data: { ticket: "ticket-1" } });
    renderHook(() => useLiveUserQuests("pat"), { wrapper });

    await expect(followed().getTicket()).resolves.toBe("ticket-1");

    expect(post).toHaveBeenCalledWith("/users/{userName}/live-tickets", {
      params: { path: { userName: "pat" } },
    });
  });

  it("marks only the user's list of quests as out of date on a change", () => {
    client.setQueryData(userQuestsQueryKey("pat"), []);
    client.setQueryData(["users", "pat"], {});
    client.setQueryData(userQuestsQueryKey("sam"), []);
    renderHook(() => useLiveUserQuests("pat"), { wrapper });

    followed().onChange();

    const isStale = (key: readonly string[]) =>
      client.getQueryState(key)?.isInvalidated;
    expect(isStale(userQuestsQueryKey("pat"))).toBe(true);
    expect(isStale(["users", "pat"])).toBe(false);
    expect(isStale(userQuestsQueryKey("sam"))).toBe(false);
  });

  it("stops following when the screen goes away", () => {
    const { unmount } = renderHook(() => useLiveUserQuests("pat"), {
      wrapper,
    });

    unmount();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
