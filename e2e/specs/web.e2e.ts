// The React app, built and served as in production: it runs under the site's
// Content Security Policy, and signing in works from the page that asked for
// it. Playing a quest, including live updates, is in playing.e2e.ts.
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

  it("shows its fonts and styles, with nothing blocked", async () => {
    await browser.url("/login");
    await expect($("#login")).toBeDisplayed();

    const fontLoaded = await browser.execute(async () => {
      await document.fonts.ready;
      return document.fonts.check('700 16px "Barlow Condensed"');
    });
    expect(fontLoaded).toBe(true);
    const buttonColor = await $("#login").getCSSProperty("background-color");
    expect(buttonColor.parsed.hex).toBe("#0a4fd6");
    // React Aria's rule, moved to the stylesheet so the policy allows it. Chrome
    // reports it by its equivalent, "manipulation".
    const touchAction = await $("#login").getCSSProperty("touch-action");
    expect(["pan-x pan-y pinch-zoom", "manipulation"]).toContain(
      touchAction.value
    );
    expect(await blockedByPolicy()).toEqual([]);
  });

  it("sends a visitor to sign in, and back to the page they wanted", async () => {
    await browser.url(`/user/${userName}`);
    await expect($("#login")).toBeDisplayed();
    await expect(browser).toHaveUrl(expect.stringContaining("/login?next="));

    await $("#user-name").setValue(userName);
    await $("#password").setValue(PASSWORD);
    await $("#login").click();

    await expect(browser).toHaveUrl(
      expect.stringContaining(`/user/${userName}`)
    );
  });

  it("has account links once signed in, including signing out", async () => {
    await signIn(userName);
    await expect($(`a[href="/user/${userName}"]`)).toExist();

    await browser.url("/login");
    await $("a=Sign out").click();

    await browser.waitUntil(
      async () => !(await browser.getUrl()).includes("/login")
    );
    await browser.url("/login");
    await expect($("#login")).toBeDisplayed();
    await expect($("a=Sign out")).not.toExist();
    expect(await blockedByPolicy()).toEqual([]);
  });

  // Shows the checks above would notice something being blocked.
  it("has the policy block a script injected into the page", async () => {
    await browser.url("/login");
    await expect($("#login")).toBeDisplayed();

    await browser.execute(() => {
      const script = document.createElement("script");
      script.textContent = "window.injected = true";
      document.body.append(script);
    });

    await browser.waitUntil(async () => (await blockedByPolicy()).length > 0);
    expect(await blockedByPolicy()).toEqual(["script-src-elem: inline"]);
  });
});
