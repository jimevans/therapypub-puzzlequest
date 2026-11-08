// The API's reference, /api/v1/docs: Swagger UI, under the site's Content
// Security Policy, which allows no inline scripts or styles.
import { blockedByPolicy, recordPolicyViolations } from "../support.js";

describe("the API reference", () => {
  before(async () => {
    await recordPolicyViolations();
  });

  it("shows every operation, with nothing blocked", async () => {
    await browser.url("/api/v1/docs");

    await expect($(".info .title")).toHaveText(
      expect.stringContaining("PuzzleQuest API")
    );
    await expect($("#operations-Sessions-getCurrentSession")).toBeDisplayed();
    expect((await $$(".opblock")).length).toBeGreaterThan(40);
    expect(await blockedByPolicy()).toEqual([]);
  });

  it("tries an operation out, from this site", async () => {
    const operation = $("#operations-Sessions-getCurrentSession");
    await operation.$(".opblock-summary-control").click();
    await operation.$("button.try-out__btn").click();
    await operation.$("button.execute").click();

    // Nobody's signed in, so the API asks them to.
    await expect(
      operation.$(".live-responses-table tbody .response-col_status")
    ).toHaveText("401");
    expect(await blockedByPolicy()).toEqual([]);
  });
});
