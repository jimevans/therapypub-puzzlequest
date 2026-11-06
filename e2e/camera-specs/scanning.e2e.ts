// Scanning a puzzle's QR code, with a fake camera that shows one. Decoding
// happens in the browser, under the site's Content Security Policy.
import {
  ADMIN,
  PASSWORD,
  SCANNED_CODE,
  api,
  sessionToken,
  signIn,
  unique,
} from "../support.js";

describe("scanning a puzzle's QR code", () => {
  const suffix = unique("").slice(1);
  const player = `scanner-${suffix}`;
  const questName = `scan-quest-${suffix}`;
  const wrongCode = `scan-wrong-${suffix}`;
  const rightCode = `scan-right-${suffix}`;

  before(async () => {
    await browser.addInitScript(() => {
      const blocked: string[] = [];
      (window as unknown as { blockedByPolicy: string[] }).blockedByPolicy =
        blocked;
      document.addEventListener("securitypolicyviolation", (event) => {
        blocked.push(`${event.effectiveDirective}: ${event.blockedURI}`);
      });
    });
    const admin = await sessionToken(ADMIN);
    await api("POST", "/users", undefined, {
      userName: player,
      displayName: "Scanner",
      email: `${player}@example.com`,
      password: PASSWORD,
    });
    for (const name of [wrongCode, rightCode]) {
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
      displayName: "The Scanning Quest",
      assignee: { kind: "user", name: player },
      puzzles: [
        { puzzleName: wrongCode, activationCode: "only-by-typing" },
        { puzzleName: rightCode, activationCode: SCANNED_CODE },
      ],
    });
    await api("POST", `/quests/${questName}/start`, admin);
    await signIn(player);
    await expect($(`a[href="/user/${player}"]`)).toExist();
  });

  it("says when the code in view is the wrong one, and carries on", async () => {
    await browser.url(`/quest/${questName}/puzzle/${wrongCode}`);

    await expect($('[role="alert"]')).toHaveText(
      "Incorrect activation code for puzzle"
    );
    await expect($("#qr-scanner")).toBeDisplayed();
  });

  it("offers typing the code instead, with one tap", async () => {
    await $("#type-code").click();
    await expect($("#qr-scanner")).not.toExist();

    await $("#activation-code").setValue("only-by-typing");
    await $("#activate").click();

    await expect($("#guess")).toBeDisplayed();
    await $("#guess").setValue("yes");
    await $("#check-answer").click();
    await expect($("#solution-text")).toHaveText("Yes");
  });

  it("starts the puzzle as soon as it sees the right code", async () => {
    await browser.url(`/quest/${questName}/puzzle/${rightCode}`);

    await expect($("#puzzle-content strong")).toHaveText("yes");
    await expect($("#qr-scanner")).not.toExist();
    const blocked = await browser.execute(
      () => (window as unknown as { blockedByPolicy: string[] }).blockedByPolicy
    );
    expect(blocked).toEqual([]);
  });
});
