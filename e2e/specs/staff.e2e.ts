// Staff following a quest from a stop: every stop in order, kept up to date as
// a player gets on, each stop's QR code to show the players, and nothing about
// how to solve any of it.
import {
  ADMIN,
  api,
  blockedByPolicy,
  expectAccessible,
  LIVE_UPDATES_CONNECTED,
  PASSWORD,
  recordPolicyViolations,
  sessionToken,
  signIn,
  unique,
} from "../support.js";

describe("staff", () => {
  const suffix = unique("").slice(1);
  const helper = `staff-${suffix}`;
  const player = `staffed-player-${suffix}`;
  const questName = `staffed-${suffix}`;
  const riddle = `staffed-riddle-${suffix}`;
  const finale = `staffed-finale-${suffix}`;
  let playerToken = "";

  before(async () => {
    const admin = await sessionToken(ADMIN);
    await api("POST", "/users", admin, {
      userName: helper,
      displayName: "A Helper",
      email: `${helper}@example.com`,
      password: PASSWORD,
      authorizationLevel: 5,
    });
    await api("POST", "/users", undefined, {
      userName: player,
      displayName: "A Staffed Player",
      email: `${player}@example.com`,
      password: PASSWORD,
    });
    playerToken = await sessionToken(player);
    await api("POST", "/puzzles", admin, {
      name: riddle,
      displayName: "The Staffed Riddle",
      text: "What has **keys**?",
      solutionKeyword: "piano",
      solutionDisplayText: "A grand piano",
      hints: [{ text: "It makes music", timePenalty: 60 }],
    });
    await api("POST", "/puzzles", admin, {
      name: finale,
      displayName: "The Staffed Finale",
      text: "Say done",
      solutionKeyword: "done",
      solutionDisplayText: "All done",
    });
    await api("POST", "/quests", admin, {
      name: questName,
      displayName: "The Staffed Quest",
      entrants: [{ kind: "user", name: player }],
      puzzles: [
        { puzzleName: riddle, activationCode: "staffed-riddle-code" },
        { puzzleName: finale, activationCode: "staffed-finale-code" },
      ],
    });
    await api("POST", `/quests/${questName}/start`, admin);
    await recordPolicyViolations();
  });

  it("find the quest on their home screen", async () => {
    await signIn(helper);
    await $(`#staff-quests [data-quest-name="${questName}"] a`).click();

    await expect($(LIVE_UPDATES_CONNECTED)).toExist();
    await expect($(`#staff-steps [data-puzzle-name="${riddle}"]`)).toHaveText(
      expect.stringContaining("Players here")
    );
    await expect($(`#staff-steps [data-puzzle-name="${finale}"]`)).toHaveText(
      expect.stringContaining("Unavailable")
    );
    await expectAccessible();
  });

  it("see the players get on, as it happens", async () => {
    await api(
      "POST",
      `/quests/${questName}/puzzles/${riddle}/activation`,
      playerToken,
      { activationCode: "staffed-riddle-code" }
    );
    await expect($(`#staff-steps [data-puzzle-name="${riddle}"]`)).toHaveText(
      expect.stringContaining("In progress")
    );

    await api(
      "POST",
      `/quests/${questName}/puzzles/${riddle}/solution-attempts`,
      playerToken,
      { guess: "a piano" }
    );
    await expect($(`#staff-steps [data-puzzle-name="${riddle}"]`)).toHaveText(
      expect.stringContaining("Solved")
    );
    await expect($(`#staff-steps [data-puzzle-name="${finale}"]`)).toHaveText(
      expect.stringContaining("Players here")
    );
    await expectAccessible();
  });

  it("never see how to solve anything", async () => {
    const page = await $("body").getText();

    for (const secret of [
      "A grand piano",
      "All done",
      "It makes music",
      "What has",
    ]) {
      expect(page).not.toContain(secret);
    }
    expect(await blockedByPolicy()).toEqual([]);
  });

  it("show the players a stop's QR code to scan", async () => {
    await $('button[aria-label="QR code for The Staffed Finale"]').click();

    const dialog = $("#qr-code-dialog");
    await expect(dialog).toBeDisplayed();
    await expect(dialog.$("h2")).toHaveText("Stop 2: The Staffed Finale");
    await expect(dialog).toHaveText(
      expect.stringContaining("staffed-finale-code")
    );
    const image = await dialog.$("img");
    await browser.waitUntil(async () =>
      browser.execute(
        (element) => (element as HTMLImageElement).naturalWidth > 0,
        image
      )
    );
    await expectAccessible();

    await dialog.$("button=Done").click();
    await expect(dialog).not.toBeDisplayed();
  });

  it("can't open the administrators' screens", async () => {
    await browser.url("/quests");

    await expect($("h1=Forbidden")).toExist();
  });
});
