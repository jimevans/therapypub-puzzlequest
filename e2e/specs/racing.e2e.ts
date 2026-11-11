// A race: two teams playing one quest, each with its own progress through the
// same stops. The puzzle master runs them from one console; while they race,
// the public sees only the standings (the leaderboard), never the stops, a
// player still racing sees only their own team, and staff see everything.
// A team that finishes sees the standings; once both have, everyone sees the
// final standings, with the winner, and each team's stops.
import {
  ADMIN,
  api,
  expectAccessible,
  LIVE_UPDATES_CONNECTED,
  PASSWORD,
  sessionToken,
  signIn,
  unique,
} from "../support.js";

describe("a race", () => {
  const suffix = unique("").slice(1);
  const questName = `race-${suffix}`;
  const riddle = `race-riddle-${suffix}`;
  const finale = `race-finale-${suffix}`;
  const reds = `reds-${suffix}`;
  const blues = `blues-${suffix}`;
  const redPlayer = `red-player-${suffix}`;
  const bluePlayer = `blue-player-${suffix}`;
  const helper = `race-staff-${suffix}`;
  // What a rival mustn't see while racing: the stops' names, the puzzle, and
  // its answer.
  const secrets = ["The Racing Riddle", "What has keys", "A grand piano"];
  let admin = "";
  let redToken = "";
  let blueToken = "";
  // Each stop's activation code, given when the quest is saved.
  const codes = new Map<string, string>();

  /**
   * Plays a stop as one team's player: activates it and answers it.
   * @param token the player's session
   * @param puzzleName the stop's puzzle
   * @param guess the answer
   */
  async function play(token: string, puzzleName: string, guess: string) {
    await api(
      "POST",
      `/quests/${questName}/puzzles/${puzzleName}/activation`,
      token,
      { activationCode: codes.get(puzzleName) }
    );
    await api(
      "POST",
      `/quests/${questName}/puzzles/${puzzleName}/solution-attempts`,
      token,
      { guess }
    );
  }

  /**
   * Signs out whoever is signed in, and signs in as someone else.
   * @param userName who to sign in as
   */
  async function switchTo(userName: string) {
    await browser.url("/logout");
    await signIn(userName);
    // Going elsewhere before signing in has finished would cancel it.
    await expect($(`a[href="/user/${userName}"]`)).toExist();
  }

  /** Signs out, and opens a page as anyone could. */
  async function openSignedOut(path: string) {
    await browser.url("/logout");
    await browser.url("/login");
    await browser.url(path);
  }

  before(async () => {
    admin = await sessionToken(ADMIN);
    for (const [userName, displayName] of [
      [redPlayer, "A Red Player"],
      [bluePlayer, "A Blue Player"],
    ] as const) {
      await api("POST", "/users", undefined, {
        userName,
        displayName,
        email: `${userName}@example.com`,
        password: PASSWORD,
      });
    }
    await api("POST", "/users", admin, {
      userName: helper,
      displayName: "A Race Helper",
      email: `${helper}@example.com`,
      password: PASSWORD,
      authorizationLevel: 5,
    });
    for (const [teamName, displayName, member] of [
      [reds, "The Racing Reds", redPlayer],
      [blues, "The Racing Blues", bluePlayer],
    ] as const) {
      await api("POST", "/teams", admin, {
        teamName,
        displayName,
        joinCode: `${teamName}-code`,
      });
      await api("PUT", `/teams/${teamName}/members/${member}`, admin, {
        joinCode: `${teamName}-code`,
      });
    }
    redToken = await sessionToken(redPlayer);
    blueToken = await sessionToken(bluePlayer);
    await api("POST", "/puzzles", admin, {
      name: riddle,
      displayName: "The Racing Riddle",
      text: "What has keys but opens no locks?",
      solutionKeyword: "piano",
      solutionDisplayText: "A grand piano",
    });
    await api("POST", "/puzzles", admin, {
      name: finale,
      displayName: "The Racing Finale",
      text: "Say done",
      solutionKeyword: "done",
      solutionDisplayText: "All done",
    });
  });

  it("is set up by an administrator, with two teams", async () => {
    await switchTo(ADMIN);
    await browser.url("/quest/new");
    await $("#quest-name").setValue(questName);
    await $("#display-name").setValue("The Great Race");
    for (const team of [reds, blues]) {
      await $("#entrant-choice").selectByAttribute("value", `team:${team}`);
      await $("#add-entrant").click();
      await expect($(`#entrants [data-entrant="team:${team}"]`)).toExist();
    }
    await $("#add-puzzles").click();
    for (const puzzle of [riddle, finale]) {
      await $("#puzzle-search").setValue(puzzle);
      await $("#choose-0").click();
    }
    await $("#puzzle-picker").$("button=Add 2 puzzles").click();
    await expectAccessible();
    await $("#save-quest").click();

    await expect($("#entrants-table")).toBeDisplayed();
    await expect($(`#entrants-table [data-entrant="team:${reds}"]`)).toHaveText(
      expect.stringContaining("Not yet started")
    );
    await expect(
      $(`#entrants-table [data-entrant="team:${blues}"]`)
    ).toHaveText(expect.stringContaining("Not yet started"));
    const quest = await api("GET", `/quests/${questName}`, admin);
    expect(quest.entries).toHaveLength(2);
    for (const stop of quest.entries[0].puzzles) {
      codes.set(stop.puzzleName, stop.activationCode);
    }
    await expectAccessible();
  });

  it("starts both teams at once from the console, after asking", async () => {
    await $("#start-all").click();
    await $("#action-dialog").$("button=Start all").click();

    for (const team of [reds, blues]) {
      await expect(
        $(`#entrants-table [data-entrant="team:${team}"]`)
      ).toHaveText(expect.stringContaining("The Racing Riddle"));
    }
  });

  it("shows one team's stops, actions and activity once it's chosen", async () => {
    await $("#entrants-table").$("a*=The Racing Reds").click();

    await expect($("#entry-heading")).toHaveText("The Racing Reds (team)");
    await expect($(`#entry #stops [data-puzzle-name="${riddle}"]`)).toHaveText(
      expect.stringContaining("Awaiting activation")
    );
    await expect($("#pause-entry")).toBeDisplayed();
    await expect($("#activity")).toHaveText(
      expect.stringContaining(`Quest started by ${ADMIN}`)
    );
    await expect($(LIVE_UPDATES_CONNECTED)).toExist();
    await expectAccessible();
  });

  it("follows each team's moves as they make them", async () => {
    await play(redToken, riddle, "a piano");

    await expect($(`#entrants-table [data-entrant="team:${reds}"]`)).toHaveText(
      expect.stringContaining("The Racing Finale")
    );
    await expect($(`#entry #stops [data-puzzle-name="${riddle}"]`)).toHaveText(
      expect.stringContaining("Completed")
    );
    await expect(
      $(`#entrants-table [data-entrant="team:${blues}"]`)
    ).toHaveText(expect.stringContaining("The Racing Riddle"));
  });

  it("shows a rival player their own team's progress alone", async () => {
    await switchTo(bluePlayer);
    await browser.url(`/quest/${questName}`);

    await expect($("#quest-progress")).toBeDisplayed();
    await expect($(`[data-puzzle-name="${riddle}"]`)).toHaveText(
      expect.stringContaining("Awaiting activation")
    );
    expect(await $("body").getText()).not.toContain("A grand piano");
  });

  it("shows a rival following along only their own team's standing", async () => {
    await browser.url(`/monitor/quest/${questName}`);

    await expect($("#standings")).toBeDisplayed();
    await expect($("#standings")).toHaveText(
      expect.stringContaining("The Racing Blues")
    );
    await expect($("#standings-when-finished")).toBeDisplayed();
    const page = await $("body").getHTML();
    expect(page).not.toContain("The Racing Reds");
    for (const secret of secrets) {
      expect(page).not.toContain(secret);
    }
    await expectAccessible();
  });

  it("shows only the standings to the public, and on the board", async () => {
    await openSignedOut(`/monitor/quest/${questName}`);
    await expect($("#standings")).toBeDisplayed();
    await expect($("#stops-hidden")).toBeDisplayed();
    for (const team of ["The Racing Reds", "The Racing Blues"]) {
      await expect($("#standings")).toHaveText(expect.stringContaining(team));
    }
    for (const secret of secrets) {
      expect(await $("body").getHTML()).not.toContain(secret);
    }

    await browser.url(`/monitor/quest/${questName}/board`);
    await expect($("#standings")).toBeDisplayed();
    for (const team of ["The Racing Reds", "The Racing Blues"]) {
      await expect($("#standings")).toHaveText(expect.stringContaining(team));
    }
    for (const secret of secrets) {
      expect(await $("body").getHTML()).not.toContain(secret);
    }
    await expectAccessible();
  });

  it("shows staff every team's stops", async () => {
    await switchTo(helper);
    await browser.url(`/quest/${questName}`);

    for (const team of ["The Racing Reds (team)", "The Racing Blues (team)"]) {
      await expect($(`h2=${team}`)).toBeDisplayed();
    }
    await expect($$(`[data-puzzle-name="${finale}"]`)).toBeElementsArrayOfSize(
      2
    );
    await expectAccessible();
  });

  it("ranks the first team to finish on the board, provisionally", async () => {
    await play(redToken, finale, "done");

    await openSignedOut(`/monitor/quest/${questName}/board`);

    await expect($("#standings caption")).toHaveText("Standings");
    const rows = $$("#standings tbody tr");
    await expect(rows[0]).toHaveText(expect.stringContaining("1st"));
    await expect(rows[0]).toHaveText(
      expect.stringContaining("The Racing Reds")
    );
    await expect(rows[1]).toHaveText(
      expect.stringContaining("The Racing Blues")
    );
    await expect($("#standings-provisional")).toBeDisplayed();
    await expect($("[data-winner]")).not.toExist();
    await expectAccessible();
  });

  it("still shows the rival, racing on, only their own team", async () => {
    await switchTo(bluePlayer);
    await browser.url(`/monitor/quest/${questName}`);

    await expect($("#standings")).toHaveText(
      expect.stringContaining("The Racing Blues")
    );
    await expect($("#standings-when-finished")).toBeDisplayed();
    expect(await $("body").getHTML()).not.toContain("The Racing Reds");
  });

  it("shows the finishing team's player the standings, live, on their quest screen", async () => {
    await switchTo(redPlayer);
    await browser.url(`/quest/${questName}`);

    await expect($("#quest-finished")).toBeDisplayed();
    await expect($("#standings")).toBeDisplayed();
    await expect($$("#standings tbody tr")[0]).toHaveText(
      expect.stringContaining("Your team")
    );
    await expect($("#standings-provisional")).toBeDisplayed();
    await expectAccessible();

    // The rivals finish while the screen is open.
    await expect($(LIVE_UPDATES_CONNECTED)).toExist();
    await play(blueToken, riddle, "piano");
    await play(blueToken, finale, "done");

    await expect($("#standings caption")).toHaveText("Final standings");
    await expect($("[data-winner]")).toHaveText(
      expect.stringContaining("The Racing Reds")
    );
    await expect($("#standings-provisional")).not.toExist();
  });

  it("keeps the final standings, with the winner, on the board", async () => {
    await openSignedOut(`/monitor/quest/${questName}/board`);

    await expect($("#standings caption")).toHaveText("Final standings");
    await expect($("[data-winner]")).toHaveText(
      expect.stringContaining("Winner")
    );
    await expect($("[data-winner]")).toHaveText(
      expect.stringContaining("The Racing Reds")
    );
    await expect($$("#standings tbody tr")[1]).toHaveText(
      expect.stringContaining("2nd")
    );
    await expectAccessible();
  });

  it("shows everyone each team's stops once both have finished", async () => {
    await openSignedOut(`/monitor/quest/${questName}`);

    await expect($("#standings caption")).toHaveText("Final standings");
    await expect($("h2=The Racing Reds")).toBeDisplayed();
    await expect($("h2=The Racing Blues")).toBeDisplayed();
    await expect($$(`[data-puzzle-name="${riddle}"]`)).toBeElementsArrayOfSize(
      2
    );
    await expect($("body")).toHaveText(
      expect.stringContaining("A grand piano")
    );
    await expectAccessible();
  });
});
