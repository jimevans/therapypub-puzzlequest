import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";
import { useSession } from "./session";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function apiAnswers(status: number, data?: unknown) {
  vi.spyOn(api, "GET").mockResolvedValue({
    data,
    response: new Response("{}", { status }),
  } as never);
}

describe("useSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives the session of whoever is signed in", async () => {
    const session = { user: { displayName: "A Player" } };
    apiAnswers(200, session);

    const { result } = renderHook(useSession, { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(session));
    expect(api.GET).toHaveBeenCalledWith("/sessions/current");
  });

  it("treats a 401 as nobody being signed in, not as an error", async () => {
    apiAnswers(401);

    const { result } = renderHook(useSession, { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("reports any other refusal as an error", async () => {
    apiAnswers(500);

    const { result } = renderHook(useSession, { wrapper });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
  });
});
