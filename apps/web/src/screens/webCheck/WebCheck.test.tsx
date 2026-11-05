import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../../api";
import { useLiveQuest } from "../../live/useLiveQuest";
import { WebCheck } from "./WebCheck";

vi.mock("../../live/useLiveQuest", () => ({ useLiveQuest: vi.fn() }));

function apiAnswers(status: number, data?: unknown) {
  return vi.spyOn(api, "GET").mockResolvedValue({
    data,
    response: new Response("{}", { status }),
  } as never);
}

function show(connected = true) {
  vi.mocked(useLiveQuest).mockReturnValue({
    connected,
    connectionId: () => undefined,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WebCheck />
    </QueryClientProvider>
  );
}

describe("WebCheck", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("says who is signed in, and that live updates connected", async () => {
    apiAnswers(200, { user: { displayName: "A Player" } });

    show();

    expect(await screen.findByText("Signed in as A Player")).toBeVisible();
    expect(screen.getByText("Connected")).toBeVisible();
  });

  it("says when nobody is signed in, or live updates haven't connected", async () => {
    apiAnswers(401);

    show(false);

    expect(await screen.findByText("Not signed in")).toBeVisible();
    expect(screen.getByText("Connecting")).toBeVisible();
  });

  it("says when the API failed", async () => {
    apiAnswers(500);

    show();

    expect(await screen.findByText(/^Failed: /)).toHaveTextContent(
      new ApiError(500).message
    );
  });

  it("checks again when asked", async () => {
    const get = apiAnswers(401);
    show();
    await screen.findByText("Not signed in");

    await userEvent.click(screen.getByRole("button", { name: "Check again" }));

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
