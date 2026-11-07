import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./serviceWorker";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubServiceWorkers() {
  const register = vi.fn(() => Promise.resolve({}));
  vi.stubGlobal("navigator", { ...navigator, serviceWorker: { register } });
  return register;
}

describe("registering the service worker", () => {
  it("happens once the page has loaded, in a built copy of the app", () => {
    vi.stubEnv("PROD", true);
    const register = stubServiceWorkers();

    registerServiceWorker();
    expect(register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("load"));

    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("doesn't happen in development", () => {
    vi.stubEnv("PROD", false);
    const register = stubServiceWorkers();

    registerServiceWorker();
    window.dispatchEvent(new Event("load"));

    expect(register).not.toHaveBeenCalled();
  });
});
