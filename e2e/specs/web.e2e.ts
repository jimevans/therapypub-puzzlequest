// The React app, built and served as in production: it runs under the site's
// Content Security Policy, reaches the API through the typed client, and
// connects to the live-update socket.
import { PASSWORD, api, signIn, unique } from "../support.js";

/**
 * Selects what the Content Security Policy has blocked on the page, which
 * browser.addInitScript has been recording since before the page's own scripts.
 * @returns the blocked directives and addresses
 */
async function blockedByPolicy(): Promise<string[]> {
  return browser.execute(
    () => (window as unknown as { blockedByPolicy: string[] }).blockedByPolicy
  );
}

describe("the web app", () => {
  const userName = `web-${unique("").slice(1)}`;

  before(async () => {
    await api("POST", "/users", undefined, {
      userName,
      displayName: "Web Player",
      email: `${userName}@example.com`,
      password: PASSWORD,
    });
    await browser.addInitScript(() => {
      const blocked: string[] = [];
      (window as unknown as { blockedByPolicy: string[] }).blockedByPolicy =
        blocked;
      document.addEventListener("securitypolicyviolation", (event) => {
        blocked.push(`${event.effectiveDirective}: ${event.blockedURI}`);
      });
    });
  });

  it("loads, and connects to the API and live updates, signed out", async () => {
    await browser.url("/web-check");

    await expect($("#bundle")).toHaveText("Loaded");
    await expect($("#session")).toHaveText("Not signed in");
    await expect($("#live-updates")).toHaveText("Connected");
    expect(await blockedByPolicy()).toEqual([]);
  });

  it("knows who is signed in", async () => {
    await signIn(userName);
    await expect($(`a[href="/user/${userName}"]`)).toExist();
    await browser.url("/web-check");

    await expect($("#session")).toHaveText("Signed in as Web Player");
    await expect($("#live-updates")).toHaveText("Connected");
    expect(await blockedByPolicy()).toEqual([]);
  });

  it("shows its fonts and styles, and its controls work", async () => {
    await browser.url("/web-check");
    await expect($("#session")).toHaveText("Signed in as Web Player");

    const fontLoaded = await browser.execute(async () => {
      await document.fonts.ready;
      return document.fonts.check('700 16px "Barlow Condensed"');
    });
    expect(fontLoaded).toBe(true);
    const buttonColor =
      await $("#check-again").getCSSProperty("background-color");
    expect(buttonColor.parsed.hex).toBe("#0a4fd6");

    // React Aria's rule, moved to the stylesheet so the policy allows it. Chrome
    // reports it by its equivalent, "manipulation".
    const touchAction = await $("#check-again").getCSSProperty("touch-action");
    expect(["pan-x pan-y pinch-zoom", "manipulation"]).toContain(
      touchAction.value
    );

    await $("#check-again").click();
    await expect($("#session")).toHaveText("Signed in as Web Player");
    expect(await blockedByPolicy()).toEqual([]);
  });

  // Shows the checks above would notice something being blocked.
  it("has the policy block a script injected into the page", async () => {
    await browser.url("/web-check");
    await expect($("#bundle")).toHaveText("Loaded");

    await browser.execute(() => {
      const script = document.createElement("script");
      script.textContent = "window.injected = true";
      document.body.append(script);
    });

    await browser.waitUntil(async () => (await blockedByPolicy()).length > 0);
    expect(await blockedByPolicy()).toEqual(["script-src-elem: inline"]);
  });
});
