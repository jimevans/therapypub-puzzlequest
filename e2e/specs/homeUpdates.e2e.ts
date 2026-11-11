// A player's home screen follows their quests live: one appears the moment a
// phone call or the puzzle master starts it, without reloading the page, and
// goes when it's reset.
import {
  ADMIN,
  PASSWORD,
  api,
  blockedByPolicy,
  expectAccessible,
  recordPolicyViolations,
  sessionToken,
  signIn,
  unique,
} from "../support.js";

describe("a player's home screen", () => {
  const suffix = unique("").slice(1);
  const player = `home-${suffix}`;
  const questName = `home-quest-${suffix}`;
  const riddle = `home-riddle-${suffix}`;
  let admin = "";

  before(async () => {
    await recordPolicyViolations();
    admin = await sessionToken(ADMIN);
    await api("POST", "/users", undefined, {
      userName: player,
      displayName: "A Home Player",
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
      displayName: "The Home Quest",
      entrants: [{ kind: "player", name: player }],
      puzzles: [{ puzzleName: riddle }],
    });
  });

  it("shows a quest as soon as it starts, and not once it's reset", async () => {
    await signIn(player);
    await browser.waitUntil(
      async () => !(await browser.getUrl()).includes("/login")
    );
    await expect($("p=You have no quests yet.")).toBeDisplayed();

    await api("POST", `/quests/${questName}/start`, admin);

    // Sooner than the screen's 30-second refresh would find it.
    const link = $(`a[href="/quest/${questName}"]`);
    await expect(link).toHaveText("The Home Quest");

    await api("POST", `/quests/${questName}/reset`, admin);

    await expect(link).not.toExist();
    await expect($("p=You have no quests yet.")).toBeDisplayed();
    expect(await blockedByPolicy()).toEqual([]);
    await expectAccessible();
  });
});
