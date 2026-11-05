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
