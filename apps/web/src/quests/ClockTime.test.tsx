import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClockTime } from "./ClockTime";

const NOW = Date.parse("2026-11-06T18:05:00Z");

describe("ClockTime", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const running = {
    running: true,
    clockStart: "2026-11-06T18:00:00.000Z",
    elapsedMs: 0,
    penaltyMs: 60_000,
    totalMs: 60_000,
  };

  it("counts up while the clock runs", () => {
    render(<ClockTime clock={running} show="elapsed" />);
    expect(screen.getByRole("timer")).toHaveTextContent("5:00");

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("timer")).toHaveTextContent("5:02");
  });

  it("includes penalties in the total", () => {
    render(<ClockTime clock={running} show="total" />);

    expect(screen.getByRole("timer")).toHaveTextContent("6:00");
  });

  it("holds still once the clock stops, as when a quest is paused", () => {
    const { rerender } = render(<ClockTime clock={running} show="total" />);

    rerender(
      <ClockTime
        clock={{
          running: false,
          elapsedMs: 300_000,
          penaltyMs: 60_000,
          totalMs: 360_000,
        }}
        show="total"
      />
    );
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByText("6:00")).toBeVisible();
  });

  it("picks up the right time when the clock starts again", () => {
    const stopped = {
      running: false,
      elapsedMs: 60_000,
      penaltyMs: 0,
      totalMs: 60_000,
    };
    const { rerender } = render(<ClockTime clock={stopped} show="elapsed" />);

    act(() => {
      vi.advanceTimersByTime(600_000);
    });
    rerender(
      <ClockTime
        clock={{
          ...stopped,
          running: true,
          clockStart: new Date(Date.now() - 60_000).toISOString(),
        }}
        show="elapsed"
      />
    );

    expect(screen.getByRole("timer")).toHaveTextContent("1:00");
  });
});
