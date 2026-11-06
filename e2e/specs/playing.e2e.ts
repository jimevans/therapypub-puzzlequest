// A player's whole journey: signing up, joining a team, starting a quest with
// a phone call, activating puzzles, hints, wrong and right answers, and
// finishing, with a spectator following along live in another window.
import {
  ADMIN,
  BASE_URL,
  LIVE_UPDATES_CONNECTED,
  PASSWORD,
  api,
  callQuestNumber,
  pickInLookup,
  sessionToken,
  signIn,
  unique,
} from "../support.js";

describe("playing a quest", () => {
  const suffix = unique("").slice(1);
  const player = `player-${suffix}`;
  const teamName = `team-${suffix}`;
  const joinCode = `join-${suffix}`;
  const teamDisplayName = `Team ${suffix}`;
  const questName = `quest-${suffix}`;
  const riddle = `riddle-${suffix}`;
  const finale = `finale-${suffix}`;
  const phoneDigits = String(Date.now() % 100).padStart(2, "0");
  let admin = "";
  // The spectator's page, open in its own browsing context all along.
  let monitor: WebdriverIO.BrowsingContext;

  before(async () => {
    admin = await sessionToken(ADMIN);
    await api("POST", "/teams", admin, {
      teamName,
      displayName: teamDisplayName,
      joinCode,
    });
    await api("POST", "/puzzles", admin, {
      name: riddle,
      displayName: "The Riddle",
      text: "What has **keys** but opens no locks?",
      solutionKeyword: "piano",
      solutionDisplayText: "A piano",
      hints: [
        { text: "It makes music", timePenalty: 60 },
        { text: "It is a piano", solutionWarning: true, timePenalty: 300 },
      ],
    });
    await api("POST", "/puzzles", admin, {
      name: finale,
      displayName: "The Finale",
      text: "Say done",
      solutionKeyword: "done",
      solutionDisplayText: "Done",
    });
    await api("POST", "/quests", admin, {
      name: questName,
      displayName: "The Quest",
      assignee: { kind: "team", name: teamName },
      puzzles: [
        { puzzleName: riddle, activationCode: "riddle-code" },
        { puzzleName: finale, activationCode: "finale-code" },
      ],
    });
  });

  it("signs up", async () => {
    await browser.url("/user/register");
    await $("#user-name").setValue(player);
    await $("#display-name").setValue("The Player");
    await $("#password").setValue(PASSWORD);
    await $("#password-confirm").setValue(PASSWORD);
    await $("#email").setValue(`${player}@example.com`);
    await $("#phone").setValue(`(312) 555-01${phoneDigits}`);
    await $("#allow-sms").click();
    await $("#save-button").click();
    await expect($("#login")).toBeDisplayed();

    await signIn(player);
    await expect($(`a[href="/user/${player}"]`)).toExist();
  });

  it("joins a team with its join code", async () => {
    await browser.url(`/user/${player}`);
    await $("=Join new team").click();
    await pickInLookup(teamName);
    await $("#join-code").setValue(joinCode);
    await $('button[data-action="confirm"]').click();

    await expect($(`//div[@id="teams"]//td[.="${teamDisplayName}"]`)).toExist();
  });

  it("starts the quest by calling its number", async () => {
    const heard = await callQuestNumber(`+131255501${phoneDigits}`);
    expect(heard).toContain("Your quest starts now");

    await browser.url("/");
    await $(`a[href="/quest/${questName}"]`).click();
    await expect($("#quest-progress")).toBeDisplayed();
  });

  it("shows spectators no more of the quest than a player has reached", async () => {
    // Over BiDi, this opens a context of its own, and doesn't switch to it.
    monitor = (await browser.newWindow(
      `${BASE_URL}/monitor/quest/${questName}`
    )) as WebdriverIO.BrowsingContext;

    await expect(monitor).toHaveUrl(`${BASE_URL}/monitor/quest/${questName}`);
    await expect(monitor.$(`[data-puzzle-name="${riddle}"]`)).toExist();
    await expect(monitor.$(`[data-puzzle-name="${finale}"]`)).not.toExist();
    await expect(monitor.$(LIVE_UPDATES_CONNECTED)).toExist();
    expect(await monitor.$("body").getHTML()).not.toContain(finale);
    await expect(
      $(`a[href="/quest/${questName}/puzzle/${finale}"]`)
    ).not.toExist();
  });

  it("needs the puzzle's activation code", async () => {
    await $(`a[href="/quest/${questName}/puzzle/${riddle}"]`).click();
    await $("#activation-code").setValue("wrong");
    await $("#activate").click();

    await expect($('[role="alert"]')).toHaveText(
      "Incorrect activation code for puzzle"
    );
  });

  it("activates the puzzle with the right code", async () => {
    await $("#activation-code").setValue("riddle-code");
    await $("#activate").click();

    await expect($("#guess")).toBeDisplayed();
    await expect($("#puzzle-content strong")).toHaveText("keys");
  });

  it("reveals hints, warning before one that gives the solution away", async () => {
    await $("#reveal-hint").click();
    await expect($("#hints")).toHaveText(
      expect.stringContaining("It makes music")
    );

    await $("#reveal-hint").click();
    await $("button=Show it").click();

    await expect($("#hints")).toHaveText(
      expect.stringContaining("It is a piano")
    );
    await expect($("#reveal-hint")).not.toExist();
  });

  it("says when an answer is wrong", async () => {
    await $("#guess").setValue("organ");
    await $("#check-answer").click();

    await expect($('[role="alert"]')).toHaveText(
      "Incorrect guess for puzzle solution"
    );
    await expect($("#solution")).not.toExist();
  });

  it("accepts the right answer, however it's typed", async () => {
    await $("#guess").setValue("Is it a PIANO?");
    await $("#check-answer").click();

    await expect($("#solution-text")).toHaveText("A piano");
  });

  it("updates the spectator's page live", async () => {
    await expect(monitor.$(`[data-puzzle-name="${riddle}"]`)).toHaveText(
      expect.stringContaining("A piano")
    );
    await expect(monitor.$(`[data-puzzle-name="${finale}"]`)).toExist();
  });

  it("leads on to the next puzzle", async () => {
    await $("=On to The Finale").click();

    await expect($("h1=The Finale")).toBeDisplayed();
    await expect($("#activation-code")).toHaveValue("");
  });

  it("stops the players while the puzzle master has the quest paused", async () => {
    await expect($("#paused-banner")).not.toExist();
    await expect($(LIVE_UPDATES_CONNECTED)).toExist();

    await api("POST", `/quests/${questName}/pause`, admin);
    await expect($("#paused-banner")).toBeDisplayed();
    await expect($("#activation-code")).toBeDisabled();

    await api("POST", `/quests/${questName}/resume`, admin);
    await expect($("#paused-banner")).not.toExist();
    await expect($("#activation-code")).toBeEnabled();
  });

  it("finishes the quest with the last puzzle", async () => {
    await $("#activation-code").setValue("finale-code");
    await $("#activate").click();
    await $("#guess").setValue("done");
    await $("#check-answer").click();

    await expect($("#solution-text")).toHaveText("Done");
    await expect($("#quest-finished")).toBeDisplayed();
    const quest = await api("GET", `/quests/${questName}`, admin);
    expect(quest.statusDescription).toBe("Completed");
    expect(quest.progress.penaltyMs).toBe(360000);
  });
});
