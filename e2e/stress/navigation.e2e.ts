// TEMPORARY, to be removed before merging: repeats what preceded Firefox's
// "no request payload was received" timeout. A page navigates itself, the
// service worker answers, and `browser.url()` follows.
const ITERATIONS = Number(process.env.STRESS_ITERATIONS ?? 300);

/** Goes to a page, and checks that the service worker controls it. */
async function visitThroughWorker(iteration: number): Promise<void> {
  await browser.url("/login");
  const controlled = await browser.execute(
    () => navigator.serviceWorker.controller !== null
  );
  if (!controlled) {
    throw new Error(`Iteration ${String(iteration)}: no worker controls it`);
  }
}

/** Has the page navigate itself to the home page, without waiting for it. */
async function navigateItself(): Promise<void> {
  await browser.execute(() => {
    location.assign("/");
  });
}

describe("navigating after a page navigates itself", function () {
  this.timeout(0);

  before(async () => {
    await browser.url("/login");
    await browser.waitUntil(() =>
      browser.execute(async () =>
        Boolean((await navigator.serviceWorker.ready).active)
      )
    );
    await browser.waitUntil(async () => {
      await browser.url("/login");
      return browser.execute(() => navigator.serviceWorker.controller !== null);
    });
  });

  it("copes when browser.url follows immediately", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      await navigateItself();
      await visitThroughWorker(i);
    }
  });

  it("copes when browser.url follows the finished page", async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      await navigateItself();
      await browser.waitUntil(() =>
        browser.execute(
          () =>
            location.pathname !== "/login" && document.readyState === "complete"
        )
      );
      await visitThroughWorker(i);
    }
  });
});
