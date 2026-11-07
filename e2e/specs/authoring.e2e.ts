// An administrator authoring puzzles and a quest through the pages, and
// finding them in the admin page's lists.
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ADMIN,
  LIVE_UPDATES_CONNECTED,
  PASSWORD,
  api,
  pickInLookup,
  sessionToken,
  signIn,
  unique,
} from "../support.js";

describe("authoring", () => {
  const suffix = unique("").slice(1);
  const textPuzzle = `text-${suffix}`;
  const imagePuzzle = `image-${suffix}`;
  const questName = `quest-${suffix}`;
  const teamName = unique("listed-team");
  const player = `author-player-${suffix}`;
  const imageFile = path.join(tmpdir(), `${imagePuzzle}.png`);
  const uploadedFile = path.join(
    import.meta.dirname,
    `../../storage/puzzleData/${imagePuzzle}.png`
  );
  let admin = "";

  before(async () => {
    admin = await sessionToken(ADMIN);
    writeFileSync(
      imageFile,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
        "base64"
      )
    );
    await api("POST", "/users", undefined, {
      userName: player,
      displayName: "Author's Player",
      email: `${player}@example.com`,
      password: PASSWORD,
    });
    await signIn(ADMIN);
    await expect($("#puzzles")).toExist();
  });

  after(() => {
    rmSync(imageFile, { force: true });
    rmSync(uploadedFile, { force: true });
  });

  it("creates a text puzzle with a hint, previewing its Markdown", async () => {
    await browser.url("/puzzle/new");
    await $("#puzzle-name").setValue(textPuzzle);
    await $("#display-name").setValue("A Text Puzzle");
    await $("#puzzle-text").setValue("Name a **color**");
    await expect($("#puzzle-content strong")).toHaveText("color");
    await $("#solution-keyword").setValue("red");
    await $("#solution-display-text").setValue("Red");
    await $("#add-hint").click();
    await $("#hint-1-text").setValue("Think of roses");
    await $("#hint-1-penalty").setValue("45");
    await $("#save-puzzle").click();
    await expect($("#edit-puzzle")).toExist();
    await expect(browser).toHaveUrl(
      expect.stringContaining(`/puzzle/${textPuzzle}`)
    );

    const puzzle = await api("GET", `/puzzles/${textPuzzle}`, admin);
    expect(puzzle).toMatchObject({
      displayName: "A Text Puzzle",
      text: "Name a **color**",
      solutionKeyword: "red",
      hints: [{ text: "Think of roses", timePenalty: 45 }],
    });
  });

  it("creates an image puzzle, uploading its file", async () => {
    await browser.url("/puzzle/new");
    await $("#puzzle-name").setValue(imagePuzzle);
    await $("#display-name").setValue("An Image Puzzle");
    await $("#puzzle-type").selectByAttribute("value", "1");
    await $("#puzzle-file").setValue(imageFile);
    await expect($("#puzzle-content img")).toHaveAttribute(
      "src",
      expect.stringContaining("blob:")
    );
    await $("#solution-keyword").setValue("blue");
    await $("#solution-display-text").setValue("Blue");
    await $("#save-puzzle").click();
    await expect($("#edit-puzzle")).toExist();
    await expect($("#puzzle-content img")).toHaveAttribute(
      "src",
      `/puzzleData/${imagePuzzle}.png`
    );

    const puzzle = await api("GET", `/puzzles/${imagePuzzle}`, admin);
    expect(puzzle.text).toBe(`/puzzleData/${imagePuzzle}.png`);
  });

  it("keeps an image puzzle's file when it's edited without a new one", async () => {
    await browser.url(`/puzzle/${imagePuzzle}/edit`);
    await $("#display-name").setValue("A Renamed Puzzle");
    await $("#save-puzzle").click();
    await expect($("h1=A Renamed Puzzle")).toExist();

    const puzzle = await api("GET", `/puzzles/${imagePuzzle}`, admin);
    expect(puzzle.text).toBe(`/puzzleData/${imagePuzzle}.png`);
  });

  it("asks in the page before leaving unsaved changes", async () => {
    await browser.url(`/puzzle/${textPuzzle}/edit`);
    await $("#display-name").setValue("Never Saved");
    await $("#puzzles").click();
    await expect($("#leave-dialog")).toBeDisplayed();
    await $("#leave-dialog").$("button=Keep editing").click();
    await expect($("#display-name")).toHaveValue("Never Saved");

    await $("#puzzles").click();
    await $("#leave-dialog").$("button=Leave").click();
    await expect($("#new-puzzle")).toExist();
    const puzzle = await api("GET", `/puzzles/${textPuzzle}`, admin);
    expect(puzzle.displayName).toBe("A Text Puzzle");
  });

  it("lists the puzzles on the admin page", async () => {
    await browser.url("/");
    await expect(browser).toHaveUrl(expect.stringContaining("/quests"));
    await $("#puzzles").click();

    await expect($(`a[href="/puzzle/${textPuzzle}"]`)).toExist();
    await expect($(`a[href="/puzzle/${imagePuzzle}"]`)).toExist();
  });

  it("creates a quest, picking its player and puzzles", async () => {
    await browser.url("/quest/new");
    await $("#quest-name").setValue(questName);
    await $("#display-name").setValue("An Authored Quest");
    await $("#set-user-button").click();
    await pickInLookup(player);
    await $('button[data-action="confirm"]').click();
    await expect($("#assignee-kind")).toHaveText("(user)");

    await $("=Add puzzle to quest").click();
    await pickInLookup(textPuzzle);
    await pickInLookup(imagePuzzle);
    await $('button[data-action="confirm"]').click();
    await $("#save-button").click();
    await expect($("#puzzles")).toExist();

    const quest = await api("GET", `/quests/${questName}`, admin);
    expect(quest.assignee).toMatchObject({ kind: "user", name: player });
    expect(
      quest.puzzles.map((p: { puzzleName: string }) => p.puzzleName)
    ).toEqual([textPuzzle, imagePuzzle]);
  });

  it("lists the quest on the admin page, with who it's assigned to", async () => {
    await browser.url("/quests");

    await expect($(`a[href="/quest/${questName}"]`)).toExist();
    await expect($(`[data-quest-name="${questName}"]`)).toHaveText(
      expect.stringContaining(`${player} (user)`)
    );
  });

  it("opens the quest's console from the list, showing every stop", async () => {
    await $(`a[href="/quest/${questName}"]`).click();
    await expect($("#stops")).toBeDisplayed();
    await expect($(`#stops [data-puzzle-name="${textPuzzle}"]`)).toHaveText(
      expect.stringContaining("Unavailable")
    );
    await expect($(`#stops [data-puzzle-name="${imagePuzzle}"]`)).toExist();
    await expect($(LIVE_UPDATES_CONNECTED)).toExist();
  });

  it("starts the quest after asking, and logs it", async () => {
    await $("#start-quest").click();
    await $("#action-dialog").$("button=Start").click();

    await expect($("#quest-status")).toHaveText("In progress");
    await expect($(`#stops [data-puzzle-name="${textPuzzle}"]`)).toHaveText(
      expect.stringContaining("Awaiting activation")
    );
    await expect($("#activity")).toHaveText(
      expect.stringContaining(`Quest started by ${ADMIN}`)
    );
  });

  it("pauses and resumes the quest", async () => {
    await $("#pause-quest").click();
    await $("#action-dialog").$("button=Pause").click();
    await expect($("#paused-banner")).toBeDisplayed();

    await $("#resume-quest").click();
    await expect($("#paused-banner")).not.toExist();
    await expect($("#activity")).toHaveText(
      expect.stringContaining("Quest resumed")
    );
  });

  it("skips a puzzle the players are stuck on, then resets it", async () => {
    await $(`button[aria-label="Skip A Text Puzzle"]`).click();
    await $("#action-dialog").$("button=Skip").click();
    await expect($(`#stops [data-puzzle-name="${textPuzzle}"]`)).toHaveText(
      expect.stringContaining("Skipped")
    );

    await $(`button[aria-label="Reset A Text Puzzle"]`).click();
    await $("#reset-puzzle-dialog").$("button=Reset").click();
    await expect($(`#stops [data-puzzle-name="${textPuzzle}"]`)).toHaveText(
      expect.stringContaining("In progress")
    );
  });

  it("says when no player can be texted", async () => {
    await $("#text-players").click();
    await $("#text-message").setValue("Look up");
    await $("#text-dialog").$("button=Send").click();

    await expect($("#text-dialog").$('[role="alert"]')).toBeDisplayed();
    await $("#text-dialog").$("button=Cancel").click();
  });

  it("downloads the run book and the QR codes", async () => {
    const links = [
      (await $("#run-book").getAttribute("href")) ?? "",
      (await $(`a[aria-label="QR code for A Text Puzzle"]`).getAttribute(
        "href"
      )) ?? "",
    ];
    const types = await browser.execute(
      async (hrefs: string[]) =>
        Promise.all(
          hrefs.map(
            async (href) =>
              (await fetch(href)).headers.get("content-type") ?? ""
          )
        ),
      links
    );

    expect(types).toEqual(["application/pdf", "image/png"]);
  });

  it("resets the quest after asking", async () => {
    await $("#reset-quest").click();
    await $("#action-dialog").$("button=Reset").click();

    await expect($("#quest-status")).toHaveText("Not yet started");
    await expect($("#activity")).toHaveText(
      expect.stringContaining("Quest reset")
    );
  });

  it("sets up a team in the page", async () => {
    await $("#teams").click();
    await $("#new-team").click();
    await $("#team-name").setValue(teamName);
    await $("#team-display-name").setValue("A Listed Team");
    await $("#team-join-code").setValue(`${teamName}-code`);
    await $("#save-team").click();
    await expect($(`[data-team-name="${teamName}"]`)).toHaveText(
      expect.stringContaining("A Listed Team")
    );

    await $('button[aria-label="Edit A Listed Team"]').click();
    await $("#team-display-name").setValue("A Renamed Team");
    await $("#save-team").click();
    await expect($(`[data-team-name="${teamName}"]`)).toHaveText(
      expect.stringContaining("A Renamed Team")
    );
  });

  it("confirms deleting in the page, and can keep it", async () => {
    await $('button[aria-label="Delete A Renamed Team"]').click();
    await expect($("#delete-dialog")).toBeDisplayed();

    await $("#delete-dialog").$("button=Keep it").click();
    await expect($("#delete-dialog")).not.toBeDisplayed();
    await expect($(`[data-team-name="${teamName}"]`)).toExist();

    await $('button[aria-label="Delete A Renamed Team"]').click();
    await $("#delete-dialog").$("button=Delete").click();
    await expect($(`[data-team-name="${teamName}"]`)).not.toExist();
  });

  it("explains why a puzzle a quest uses can't be deleted", async () => {
    await $("#puzzles").click();
    await $(`[data-puzzle-name="${textPuzzle}"]`).$("button=Delete").click();
    await $("#delete-dialog").$("button=Delete").click();

    await expect($('[role="alert"]')).toBeDisplayed();
    await expect($(`[data-puzzle-name="${textPuzzle}"]`)).toExist();
  });

  it("deletes a quest", async () => {
    await $("#quests").click();
    await $(`[data-quest-name="${questName}"]`).$("button=Delete").click();
    await $("#delete-dialog").$("button=Delete").click();

    await expect($(`[data-quest-name="${questName}"]`)).not.toExist();
  });
});
