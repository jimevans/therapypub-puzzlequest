// Stopping the server cleanly when the host asks it to.
import { describe, expect, it, vi } from "vitest";
import { createShutdown } from "../src/shutdown.js";

/**
 * Makes fakes of what shutting down stops, recording the order things
 * happen in.
 * @param requestsFinish whether the requests running finish in time
 * @returns the fakes, and what happened
 */
function fakes(requestsFinish: boolean) {
  const happened: string[] = [];
  let finishRequests: (() => void) | undefined;
  const client = {
    close: vi.fn((code: number) => happened.push(`socket closed ${code}`)),
  };
  const parts = {
    server: {
      close: vi.fn((callback: () => void) => {
        happened.push("stopped taking connections");
        finishRequests = callback;
      }),
      closeIdleConnections: vi.fn(() => {
        happened.push("closed idle connections");
        if (requestsFinish) {
          queueMicrotask(() => finishRequests?.());
        }
      }),
      closeAllConnections: vi.fn(() => happened.push("cut off requests")),
    },
    socketServer: {
      clients: new Set([client]),
      close: vi.fn(() => happened.push("stopped live updates")),
    },
    disconnect: vi.fn(async () => {
      happened.push("disconnected the database");
    }),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    exit: vi.fn((code: number) => happened.push(`exited ${code}`)),
    graceMs: 50,
  };
  return { parts, happened };
}

describe("shutting down", () => {
  it("lets requests finish, tells live clients, then disconnects and exits", async () => {
    const { parts, happened } = fakes(true);

    await createShutdown(parts as never)("SIGTERM");

    expect(happened).toEqual([
      "stopped taking connections",
      "closed idle connections",
      "socket closed 1001",
      "stopped live updates",
      "disconnected the database",
      "exited 0",
    ]);
    expect(parts.log.info).toHaveBeenCalledWith(
      { reason: "SIGTERM" },
      "shutting down"
    );
  });

  it("cuts off requests still running when time runs out", async () => {
    const { parts, happened } = fakes(false);

    await createShutdown(parts as never)("SIGTERM");

    expect(happened).toContain("cut off requests");
    expect(happened.at(-1)).toBe("exited 0");
    expect(parts.log.warn).toHaveBeenCalled();
  });

  it("still exits if the database won't disconnect", async () => {
    const { parts } = fakes(true);
    parts.disconnect.mockRejectedValue(new Error("already gone"));

    await createShutdown(parts as never)("SIGINT");

    expect(parts.log.error).toHaveBeenCalled();
    expect(parts.exit).toHaveBeenCalledWith(0);
  });

  it("happens once, however many signals come", async () => {
    const { parts } = fakes(true);
    const shutdown = createShutdown(parts as never);

    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);

    expect(parts.server.close).toHaveBeenCalledTimes(1);
    expect(parts.exit).toHaveBeenCalledTimes(1);
  });
});
