import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reloadWhenChunksAreReplaced } from "./reloadOnNewDeployment";

describe("reloadWhenChunksAreReplaced", () => {
  const reload = vi.fn();
  let added: EventListenerOrEventListenerObject | undefined;

  function failToLoadChunk(): Event {
    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    sessionStorage.clear();
    reload.mockClear();
    vi.stubGlobal("location", { reload });
    const addEventListener = window.addEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        added = listener;
        addEventListener(type, listener);
      }
    );
    reloadWhenChunksAreReplaced();
  });

  afterEach(() => {
    if (added) {
      window.removeEventListener("vite:preloadError", added);
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reloads, instead of showing the error", () => {
    const event = failToLoadChunk();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("lets the error through if reloading didn't help, instead of looping", () => {
    failToLoadChunk();
    reload.mockClear();
    vi.advanceTimersByTime(5000);

    const event = failToLoadChunk();

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("reloads again for a later deployment", () => {
    failToLoadChunk();
    reload.mockClear();
    vi.advanceTimersByTime(60000);

    failToLoadChunk();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("works without storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    failToLoadChunk();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
