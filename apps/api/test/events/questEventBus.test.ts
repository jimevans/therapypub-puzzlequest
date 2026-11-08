import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type QuestActivity,
  QuestEventBus,
} from "../../src/events/questEventBus.js";
import { recordLogs } from "../logs.js";

const activity: QuestActivity = {
  questName: "quest1",
  actor: "player",
  events: [{ type: "QuestStarted", at: new Date("2026-11-03T20:00:00Z") }],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("QuestEventBus", () => {
  it("passes published activity to every handler", async () => {
    const bus = new QuestEventBus();
    const first = vi.fn();
    const second = vi.fn();
    bus.subscribe(first);
    bus.subscribe(second);

    await bus.publish(activity);

    expect(first).toHaveBeenCalledWith(activity);
    expect(second).toHaveBeenCalledWith(activity);
  });

  it("stops passing activity to a handler once it unsubscribes", async () => {
    const bus = new QuestEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe(handler);

    unsubscribe();
    await bus.publish(activity);

    expect(handler).not.toHaveBeenCalled();
  });

  it("waits for handlers to finish", async () => {
    const bus = new QuestEventBus();
    let finished = false;
    bus.subscribe(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      finished = true;
    });

    await bus.publish(activity);

    expect(finished).toBe(true);
  });

  it("logs a failing handler without affecting the others or the caller", async () => {
    const logs = recordLogs();
    const bus = new QuestEventBus();
    const working = vi.fn();
    bus.subscribe(async () => {
      throw new Error("database down");
    });
    bus.subscribe(() => {
      throw new Error("socket closed");
    });
    bus.subscribe(working);

    await expect(bus.publish(activity)).resolves.toBeUndefined();

    expect(working).toHaveBeenCalledWith(activity);
    for (const message of ["database down", "socket closed"]) {
      expect(logs).toContainEqual(
        expect.objectContaining({
          level: "error",
          msg: "handling quest activity failed",
          questName: "quest1",
          err: expect.objectContaining({ message }),
        })
      );
    }
  });
});
