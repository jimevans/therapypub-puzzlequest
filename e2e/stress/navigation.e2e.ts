// TEMPORARY, to be removed before merging: repeats what preceded Firefox's
// "no request payload was received" timeout. A page navigates itself, the
// service worker answers, and `browser.url()` follows.
import { appendFileSync } from "node:fs";

const ITERATIONS = Number(process.env.STRESS_ITERATIONS ?? 300);
const EVENT_LOG = process.env.STRESS_EVENT_LOG;
const STALLS_PER_TEST = 5;
const NO_WORKER = process.env.STRESS_NO_WORKER === "true";
const EVENTS = [
  "browsingContext.navigationStarted",
  "browsingContext.navigationAborted",
  "browsingContext.navigationFailed",
  "browsingContext.fragmentNavigated",
  "browsingContext.domContentLoaded",
  "browsingContext.load",
] as const;

/** Adds a line to the record of what the browser reported. */
function record(entry: object): void {
  if (EVENT_LOG) {
    appendFileSync(
      EVENT_LOG,
      `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`
    );
  }
}

/** Runs the body repeatedly, noting each stall, up to a limit. */
async function repeat(
  name: string,
  body: (iteration: number) => Promise<void>
): Promise<void> {
  let stalls = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    try {
      await body(i);
    } catch (error) {
      record({ stall: String(error), test: name, iteration: i });
      if (++stalls >= STALLS_PER_TEST) {
        throw error;
      }
    }
  }
  record({ finished: name, stalls });
}

/** Goes to a page, and checks that the service worker controls it. */
async function visitThroughWorker(iteration: number): Promise<void> {
  await browser.url("/login");
  if (NO_WORKER) {
    return;
  }
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
    for (const event of EVENTS) {
      // Firefox doesn't know every event in the standard.
      await browser.sessionSubscribe({ events: [event] }).catch(() => {
        record({ unsupported: event });
      });
      browser.on(
        event,
        (params: { navigation: string | null; url: string }) => {
          record({ event, navigation: params.navigation, url: params.url });
        }
      );
    }
    await browser.url("/login");
    if (NO_WORKER) {
      return;
    }
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
    await repeat("immediately", async (i) => {
      await navigateItself();
      await visitThroughWorker(i);
    });
  });

  it("copes when browser.url follows a server redirect", async () => {
    await repeat("redirect", async (i) => {
      await browser.url("/logout");
      await visitThroughWorker(i);
    });
  });

  it("copes when browser.url follows the finished page", async () => {
    await repeat("finished", async (i) => {
      await navigateItself();
      await browser.waitUntil(() =>
        browser.execute(
          () =>
            location.pathname !== "/login" && document.readyState === "complete"
        )
      );
      await visitThroughWorker(i);
    });
  });
});
