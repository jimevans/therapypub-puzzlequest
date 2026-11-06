// The React app, built and served as in production: it runs under the site's
// Content Security Policy, and signing in works from the page that asked for
// it. A player's own quests follow along live. Playing a whole quest is in
// playing.e2e.ts.
import {
  ADMIN,
  LIVE_UPDATES_CONNECTED,
  PASSWORD,
  api,
  sessionToken,
  signIn,
  unique,
} from "../support.js";

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

  describe("a player's quest", () => {
    const suffix = unique("").slice(1);
    const questName = `web-quest-${suffix}`;
    const first = `web-first-${suffix}`;
    const second = `web-second-${suffix}`;
    const hidden = `web-hidden-${suffix}`;
    let admin = "";
    let player = "";

    before(async () => {
      admin = await sessionToken(ADMIN);
      player = await sessionToken(userName);
      for (const name of [first, second, hidden]) {
        await api("POST", "/puzzles", admin, {
          name,
          displayName: `Puzzle ${name}`,
          text: "Say **yes**",
          solutionKeyword: "yes",
          solutionDisplayText: "Yes",
        });
      }
      await api("POST", "/quests", admin, {
        name: questName,
        displayName: "The Web Quest",
        assignee: { kind: "user", name: userName },
        puzzles: [
          { puzzleName: first, activationCode: "first-code" },
          { puzzleName: second, activationCode: "second-code" },
          { puzzleName: hidden, activationCode: "hidden-code" },
        ],
      });
      await api("POST", `/quests/${questName}/start`, admin);
      await signIn(userName);
    });

    it("is listed on the player's home page", async () => {
      const link = $(`a[href="/quest/${questName}"]`);

      await expect(link).toHaveText("The Web Quest");
      await link.click();

      await expect($("#quest-progress")).toBeDisplayed();
      await expect($(LIVE_UPDATES_CONNECTED)).toExist();
      await expect($(`[data-puzzle-name="${first}"]`)).toExist();
      expect(await blockedByPolicy()).toEqual([]);
    });

    it("shows what the players do, as they do it", async () => {
      await api(
        "POST",
        `/quests/${questName}/puzzles/${first}/activation`,
        player,
        { activationCode: "first-code" }
      );
      await expect($(`[data-puzzle-name="${first}"]`)).toHaveText(
        expect.stringContaining("In progress")
      );

      await api(
        "POST",
        `/quests/${questName}/puzzles/${first}/solution-attempts`,
        player,
        { guess: "yes" }
      );

      await expect($(`[data-puzzle-name="${first}"]`)).toHaveText(
        expect.stringContaining("Yes")
      );
      await expect($(`[data-puzzle-name="${second}"]`)).toExist();
    });

    it("shows when the puzzle master pauses and resumes it", async () => {
      await api("POST", `/quests/${questName}/pause`, admin);
      await expect($("#paused-banner")).toBeDisplayed();

      await api("POST", `/quests/${questName}/resume`, admin);
      await expect($("#paused-banner")).not.toExist();
    });

    it("doesn't reveal what the players haven't reached", async () => {
      await expect($(`[data-puzzle-name="${second}"]`)).toExist();

      expect(await $("body").getHTML()).not.toContain(hidden);
      expect(await blockedByPolicy()).toEqual([]);
    });

    it("opens a puzzle, and shows its Markdown, with nothing blocked", async () => {
      await $(`a[href="/quest/${questName}/puzzle/${second}"]`).click();
      await $("#activation-code").setValue("second-code");
      await $("#activate").click();

      await expect($("#puzzle-content strong")).toHaveText("yes");
      expect(await blockedByPolicy()).toEqual([]);
    });

    it("can be followed by anyone, signed in or not", async () => {
      await browser.url("/logout");
      await browser.url(`/monitor/quest/${questName}`);

      await expect($("#quest-progress")).toBeDisplayed();
      await expect($(LIVE_UPDATES_CONNECTED)).toExist();
      await expect($(`[data-puzzle-name="${second}"]`)).toExist();
      expect(await $("body").getHTML()).not.toContain(hidden);
      await expect($("#activation-code")).not.toExist();
    });

    it("shows on a big screen, signed out, following along live", async () => {
      await $("=Show on a big screen").click();

      await expect($(`[data-quest-name="${questName}"]`)).toBeDisplayed();
      await expect($(LIVE_UPDATES_CONNECTED)).toExist();
      expect(await $("body").getHTML()).not.toContain(hidden);
      await expect($("#paused-banner")).not.toExist();

      await api("POST", `/quests/${questName}/pause`, admin);
      await expect($("#paused-banner")).toBeDisplayed();

      await api("POST", `/quests/${questName}/resume`, admin);
      await expect($("#paused-banner")).not.toExist();
      expect(await blockedByPolicy()).toEqual([]);
    });

    it("shows spectators a puzzle, read-only, updating live", async () => {
      await browser.url(`/monitor/quest/${questName}`);
      await $(`a[href="/monitor/quest/${questName}/puzzle/${second}"]`).click();

      await expect($("#puzzle-content strong")).toHaveText("yes");
      await expect($("#guess")).not.toExist();
      await expect($("#solution")).not.toExist();

      await api(
        "POST",
        `/quests/${questName}/puzzles/${second}/solution-attempts`,
        player,
        { guess: "yes" }
      );

      await expect($("#solution-text")).toHaveText("Yes");
      expect(await blockedByPolicy()).toEqual([]);
    });

    it("isn't available once the puzzle master resets it", async () => {
      await api("POST", `/quests/${questName}/reset`, admin);
      // A reset sends no live update; an open screen sees it on its next refresh.
      await browser.refresh();

      await expect($("h1=Puzzle not available")).toBeDisplayed();

      await browser.url(`/monitor/quest/${questName}`);
      await expect($("#quest-not-started")).toBeDisplayed();
      await expect($("[data-puzzle-name]")).not.toExist();
    });
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
