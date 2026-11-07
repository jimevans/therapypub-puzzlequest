// The service worker, which answers repeat visits from its copy of the app.
// Chrome runs every spec with it; Firefox runs only this one with it (see
// wdio.conf.ts).
import { blockedByPolicy, recordPolicyViolations } from "../support.js";

describe("the service worker", () => {
  before(async () => {
    await recordPolicyViolations();
  });

  it("opens a page from its copy on a repeat visit", async () => {
    await browser.url("/login");
    await expect($("#login")).toBeDisplayed();
    await browser.waitUntil(() =>
      browser.execute(async () =>
        Boolean((await navigator.serviceWorker.ready).active)
      )
    );

    await browser.url("/user/password/forgot");
    await expect($("h1")).toBeDisplayed();
    // The worker controls the page, and holds its copy of the app's page to
    // answer with. (Chrome also reports starting the worker for the page, in
    // workerStart; Firefox reports 0 there.)
    expect(
      await browser.execute(() => navigator.serviceWorker.controller !== null)
    ).toBe(true);
    expect(
      await browser.execute(async () => Boolean(await caches.match("/")))
    ).toBe(true);
    expect(await blockedByPolicy()).toEqual([]);
  });

  it("leaves the administrators' screens to the server", async () => {
    await browser.url("/quests");

    // Signed out, the server sends the visitor to sign in, which the app's own
    // page couldn't do before loading.
    await expect(browser).toHaveUrl(expect.stringContaining("/login?next="));
    expect(await blockedByPolicy()).toEqual([]);
  });
});
