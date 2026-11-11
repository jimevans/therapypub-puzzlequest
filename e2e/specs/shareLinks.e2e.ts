// A private quest: hidden from those it isn't for, until one of its players
// gives someone a link, which works without an account until it's revoked.
import {
  ADMIN,
  LIVE_UPDATES_CONNECTED,
  PASSWORD,
  api,
  blockedByPolicy,
  expectAccessible,
  recordPolicyViolations,
  sessionToken,
  signIn,
  unique,
} from "../support.js";

describe("a private quest", () => {
  const suffix = unique("").slice(1);
  const player = `sharer-${suffix}`;
  const questName = `private-${suffix}`;
  const riddle = `shared-riddle-${suffix}`;
  let link = "";
  let boardLink = "";

  before(async () => {
    await recordPolicyViolations();
    const admin = await sessionToken(ADMIN);
    await api("POST", "/users", undefined, {
      userName: player,
      displayName: "A Sharer",
      email: `${player}@example.com`,
      password: PASSWORD,
    });
    await api("POST", "/puzzles", admin, {
      puzzleName: riddle,
      displayName: "A Riddle",
      solutionKeyword: "piano",
      solutionText: "A piano",
    });
    await api("POST", "/quests", admin, {
      questName,
      displayName: "A Private Quest",
      visibility: "private",
      entrants: [{ kind: "player", name: player }],
      puzzles: [{ puzzleName: riddle }],
    });
    await api("POST", `/quests/${questName}/start`, admin);
  });

  it("can't be followed without a link", async () => {
    await browser.url(`/monitor/quest/${questName}`);

    await expect($("h1")).toHaveText(expect.stringMatching(/not/i));
  });

  it("lets its player make a link", async () => {
    await signIn(player);
    // Going elsewhere before signing in has finished would cancel it.
    await browser.waitUntil(
      async () => !(await browser.getUrl()).includes("/login")
    );
    await browser.url(`/quest/${questName}`);

    // Closed at first, so it doesn't crowd the quest.
    await expect($("button=Make a link")).not.toBeDisplayed();
    await $("#share-links-toggle").click();
    await $("button=Make a link").click();
    await expect($("#share-link-dialog")).toBeDisplayed();
    await $("#share-link-label").setValue("My grandmother");
    await $("button=Make the link").click();

    await expect($("#share-link-address")).toBeDisplayed();
    link = await $("#share-link-address").getValue();
    expect(link).toContain("#share=");
    boardLink = await $("#share-link-board-address").getValue();
    expect(boardLink).toContain("/board#share=");
    await expectAccessible();
    await $("button=Done").click();

    await expect($("#share-link-dialog")).not.toBeDisplayed();
    await expect($("#share-link-list")).toHaveText(
      expect.stringContaining("My grandmother")
    );
    await expectAccessible();
  });

  it("lets someone with the link follow, signed out", async () => {
    await browser.url("/logout");
    await browser.url("/login");
    await browser.url(link);

    await expect($("h1")).toHaveText(
      expect.stringContaining("A Private Quest")
    );
    await expect($(LIVE_UPDATES_CONNECTED)).toExist();
    expect(await blockedByPolicy()).toEqual([]);
    await expectAccessible();
  });

  it("shows on a big screen with the board link, signed out", async () => {
    await browser.url("/login");
    await browser.url(boardLink);

    await expect($(`[data-quest-name="${questName}"]`)).toBeDisplayed();
    await expect($(LIVE_UPDATES_CONNECTED)).toExist();
    expect(await blockedByPolicy()).toEqual([]);
    await expectAccessible();
  });

  it("stops working once revoked", async () => {
    const token = await sessionToken(player);
    const { links } = (await api(
      "GET",
      `/quests/${questName}/share-links`,
      token
    )) as { links: { id: string }[] };
    await api(
      "DELETE",
      `/quests/${questName}/share-links/${links[0].id}`,
      token
    );

    await browser.url("/login");
    await browser.url(link);

    await expect($("h1")).toHaveText(expect.stringMatching(/not/i));
  });
});
