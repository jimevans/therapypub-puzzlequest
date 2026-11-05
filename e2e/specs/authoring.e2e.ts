// An administrator authoring puzzles and a quest through the pages, and
// finding them in the admin page's lists.
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ADMIN,
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

  it("creates a text puzzle with a hint", async () => {
    await browser.url("/puzzle/new");
    await $("#puzzle-name").setValue(textPuzzle);
    await $("#display-name").setValue("A Text Puzzle");
    await $("#puzzle-content textarea").setValue("Name a **color**");
    await expect($("#puzzle-content strong")).toHaveText("color");
    await $("#solution-keyword").setValue("red");
    await $("#solution-display-text").setValue("Red");
    await $("=Add hint").click();
    await $('#hints td[data-field-name="text"] input').setValue(
      "Think of roses"
    );
    await $('#hints td[data-field-name="timePenalty"] input').setValue("45");
    await $("#hints tbody td:last-of-type button:not(.pq-hide)").click();
    await $("#save-button").click();
    await expect($("#puzzles")).toExist();

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
    await $('#puzzle-content input[type="file"]').setValue(imageFile);
    await $("#solution-keyword").setValue("blue");
    await $("#solution-display-text").setValue("Blue");
    await $("#save-button").click();
    await expect($("#puzzles")).toExist();

    const puzzle = await api("GET", `/puzzles/${imagePuzzle}`, admin);
    expect(puzzle.text).toBe(`/puzzleData/${imagePuzzle}.png`);
  });

  it("keeps an image puzzle's file when it's edited without a new one", async () => {
    await browser.url(`/puzzle/${imagePuzzle}/edit`);
    await $("#display-name").setValue("A Renamed Puzzle");
    await $("#save-button").click();
    await browser.waitUntil(
      async () =>
        (await api("GET", `/puzzles/${imagePuzzle}`, admin)).displayName ===
        "A Renamed Puzzle"
    );

    const puzzle = await api("GET", `/puzzles/${imagePuzzle}`, admin);
    expect(puzzle.text).toBe(`/puzzleData/${imagePuzzle}.png`);
  });

  it("lists the puzzles on the admin page", async () => {
    await browser.url("/");
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
    await browser.url("/");
    await $("#quests").click();

    await expect($(`a[href="/quest/${questName}"]`)).toExist();
    await expect(
      $(`//td[@data-field-name="assignedTo"][.="${player} (user)"]`)
    ).toExist();
  });
});
