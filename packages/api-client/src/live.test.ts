import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_RETRY_DELAY_MS,
  REFRESH_INTERVAL_MS,
  type QuestFollower,
  followQuest,
  followUserQuests,
} from "./live.js";

/** Stands in for the browser's WebSocket, driven by the tests. */
class FakeSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static all: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  sent: unknown[] = [];

  constructor(readonly url: string) {
    super();
    FakeSocket.all.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = FakeSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(data: unknown): void {
    const text = typeof data === "string" ? data : JSON.stringify(data);
    this.dispatchEvent(new MessageEvent("message", { data: text }));
  }

  /** The connection is made, and the server answers the subscription. */
  connect(connectionId = "connection-1"): void {
    this.open();
    this.receive({ message: "connection", connectionId });
  }
}

/** The socket made most recently. */
function latest(): FakeSocket {
  const socket = FakeSocket.all.at(-1);
  if (!socket) {
    throw new Error("No socket has been made");
  }
  return socket;
}

function setVisibility(state: "visible" | "hidden"): void {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("followQuest", () => {
  const onChange = vi.fn();
  const onConnectionChange = vi.fn();
  const getTicket = vi.fn<() => Promise<string>>();
  let follower: QuestFollower;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    FakeSocket.all = [];
    onChange.mockClear();
    onConnectionChange.mockClear();
    getTicket.mockReset();
    getTicket.mockResolvedValue("ticket-1");
    follower = followQuest({
      url: "ws://site/api/v1/updates",
      questName: "trail",
      getTicket,
      onChange,
      onConnectionChange,
    });
  });

  afterEach(() => {
    follower.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("connecting", () => {
    it("connects to the address it's given", () => {
      expect(FakeSocket.all).toHaveLength(1);
      expect(latest().url).toBe("ws://site/api/v1/updates");
    });

    it("subscribes to the quest with a new ticket once the socket opens", async () => {
      expect(latest().sent).toEqual([]);
      expect(getTicket).not.toHaveBeenCalled();

      latest().open();
      await vi.advanceTimersByTimeAsync(0);

      expect(latest().sent).toEqual([
        { message: "subscribe", questName: "trail", ticket: "ticket-1" },
      ]);
    });

    it("tries again with a new connection if it can't get a ticket", async () => {
      getTicket.mockRejectedValueOnce(new Error("offline"));

      latest().open();
      await vi.advanceTimersByTimeAsync(0);
      expect(latest().sent).toEqual([]);
      expect(latest().readyState).toBe(FakeSocket.CLOSED);

      await vi.advanceTimersByTimeAsync(1000);
      expect(FakeSocket.all).toHaveLength(2);
    });

    it("sends nothing if stopped while getting a ticket", async () => {
      const socket = latest();
      socket.open();

      follower.stop();
      await vi.advanceTimersByTimeAsync(0);

      expect(socket.sent).toEqual([]);
    });

    it("keeps the connection's ID for the client's own actions", () => {
      expect(follower.connectionId()).toBeUndefined();

      latest().connect("abc");

      expect(follower.connectionId()).toBe("abc");
      expect(onConnectionChange).toHaveBeenCalledExactlyOnceWith(true);
    });

    it("asks for fresh state on connecting, since updates may have been missed", () => {
      latest().connect();

      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("updates", () => {
    beforeEach(() => {
      latest().connect();
      onChange.mockClear();
    });

    it("asks for fresh state on each update", () => {
      latest().receive({ message: "hintRevealed", questName: "trail" });
      latest().receive({ message: "puzzleSolved", questName: "trail" });

      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("ignores a message that isn't JSON", () => {
      latest().receive("not json");

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("losing the connection", () => {
    it("reports it, forgets the ID, and tries again", () => {
      latest().connect();
      onConnectionChange.mockClear();

      latest().close();

      expect(onConnectionChange).toHaveBeenCalledExactlyOnceWith(false);
      expect(follower.connectionId()).toBeUndefined();
      expect(FakeSocket.all).toHaveLength(1);

      vi.advanceTimersByTime(1000);

      expect(FakeSocket.all).toHaveLength(2);
    });

    it("doesn't report a loss when it never connected", () => {
      latest().close();

      expect(onConnectionChange).not.toHaveBeenCalled();
    });

    it("waits longer after each failure, up to a limit", () => {
      for (const delay of [1000, 2000, 4000, 8000]) {
        const count = FakeSocket.all.length;
        latest().close();
        vi.advanceTimersByTime(delay - 1);
        expect(FakeSocket.all).toHaveLength(count);
        vi.advanceTimersByTime(1);
        expect(FakeSocket.all).toHaveLength(count + 1);
      }

      const count = FakeSocket.all.length;
      latest().close();
      vi.advanceTimersByTime(MAX_RETRY_DELAY_MS);
      expect(FakeSocket.all).toHaveLength(count + 1);
    });

    it("waits only briefly again after a successful connection", () => {
      latest().close();
      vi.advanceTimersByTime(1000);
      latest().close();
      vi.advanceTimersByTime(2000);
      latest().connect();
      const count = FakeSocket.all.length;

      latest().close();
      vi.advanceTimersByTime(1000);

      expect(FakeSocket.all).toHaveLength(count + 1);
    });

    it("gets fresh state after reconnecting", () => {
      latest().connect();
      latest().close();
      vi.advanceTimersByTime(1000);
      onChange.mockClear();

      latest().connect("second");

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(follower.connectionId()).toBe("second");
    });
  });

  describe("coming back online", () => {
    it("replaces a socket that may be dead, without waiting for it", () => {
      latest().connect();
      const old = latest();

      window.dispatchEvent(new Event("online"));

      expect(FakeSocket.all).toHaveLength(2);
      expect(latest()).not.toBe(old);
      expect(old.readyState).toBe(FakeSocket.CLOSED);
    });

    it("ignores anything further from the old socket", () => {
      latest().connect();
      const old = latest();
      window.dispatchEvent(new Event("online"));
      onChange.mockClear();

      old.receive({ message: "puzzleSolved", questName: "trail" });
      old.close();
      vi.advanceTimersByTime(MAX_RETRY_DELAY_MS);

      expect(onChange).not.toHaveBeenCalled();
      expect(FakeSocket.all).toHaveLength(2);
    });

    it("doesn't also reconnect from a pending retry", () => {
      latest().close();
      window.dispatchEvent(new Event("online"));
      expect(FakeSocket.all).toHaveLength(2);

      vi.advanceTimersByTime(MAX_RETRY_DELAY_MS);

      expect(FakeSocket.all).toHaveLength(2);
    });
  });

  describe("coming back into view", () => {
    it("gets fresh state over a live connection", () => {
      latest().connect();
      onChange.mockClear();

      setVisibility("visible");

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(FakeSocket.all).toHaveLength(1);
    });

    it("reconnects at once if the connection is gone", () => {
      latest().close();

      setVisibility("visible");

      expect(FakeSocket.all).toHaveLength(2);
    });

    it("does nothing on going out of view", () => {
      latest().connect();
      onChange.mockClear();

      setVisibility("hidden");

      expect(onChange).not.toHaveBeenCalled();
      expect(FakeSocket.all).toHaveLength(1);
    });
  });

  describe("refreshing on a timer", () => {
    beforeEach(() => {
      latest().connect();
      onChange.mockClear();
    });

    it("gets fresh state regularly while in view", () => {
      vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 2);

      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("doesn't while out of view", () => {
      setVisibility("hidden");

      vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 2);

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("stopping", () => {
    it("closes the socket and doesn't reconnect or report", () => {
      latest().connect();
      onChange.mockClear();
      onConnectionChange.mockClear();

      follower.stop();
      vi.advanceTimersByTime(REFRESH_INTERVAL_MS);
      window.dispatchEvent(new Event("online"));
      setVisibility("visible");

      expect(latest().readyState).toBe(FakeSocket.CLOSED);
      expect(FakeSocket.all).toHaveLength(1);
      expect(onChange).not.toHaveBeenCalled();
      expect(onConnectionChange).not.toHaveBeenCalled();
    });

    it("cancels a pending retry", () => {
      latest().close();

      follower.stop();
      vi.advanceTimersByTime(MAX_RETRY_DELAY_MS);

      expect(FakeSocket.all).toHaveLength(1);
    });
  });
});

// The same follower underneath, so only what differs is tested here.
describe("followUserQuests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    FakeSocket.all = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("subscribes to the user's quests, and asks for fresh state on each change", async () => {
    const onChange = vi.fn();
    const follower = followUserQuests({
      url: "ws://site/api/v1/updates",
      userName: "pat",
      getTicket: () => Promise.resolve("ticket-1"),
      onChange,
    });

    latest().open();
    await vi.advanceTimersByTimeAsync(0);
    expect(latest().sent).toEqual([
      { message: "subscribe", userName: "pat", ticket: "ticket-1" },
    ]);
    latest().receive({ message: "connection", connectionId: "c1" });
    latest().receive({ message: "questsChanged" });

    expect(onChange).toHaveBeenCalledTimes(2);
    follower.stop();
    expect(latest().readyState).toBe(FakeSocket.CLOSED);
  });
});
