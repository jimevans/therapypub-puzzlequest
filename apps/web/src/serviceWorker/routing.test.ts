import { describe, expect, it } from "vitest";
import { handlingOf } from "./routing";

const ORIGIN = "https://puzzlequest.example";

const page = (path: string) => ({
  url: `${ORIGIN}${path}`,
  method: "GET",
  mode: "navigate",
});

describe("the service worker", () => {
  it.each([
    "/",
    "/login",
    "/quest/trail",
    "/quest/trail/puzzle/riddle",
    "/monitor/quest/trail",
    "/monitor/quest/trail/board",
    "/user/player",
    "/user/register",
    "/user/password/forgot",
    "/no-such-page",
  ])("answers the app's page %s from its copy", (path) => {
    expect(handlingOf(page(path), ORIGIN)).toBe("page");
  });

  it.each([
    "/api/v1/quests",
    "/logout",
    "/puzzleData/riddle.png",
    "/policies/privacy.html",
    "/style/error.css",
    "/image/pq-logo-192.png",
    "/user/password/reset",
    "/user/email/verify",
    "/quests",
    "/puzzles",
    "/users",
    "/teams",
    "/puzzle/riddle",
    "/puzzle/riddle/edit",
    "/quest/new",
    "/quest/trail/edit",
  ])("leaves %s to the server", (path) => {
    expect(handlingOf(page(path), ORIGIN)).toBe("network");
  });

  it("keeps built files", () => {
    expect(
      handlingOf(
        { url: `${ORIGIN}/assets/index-abc.js`, method: "GET", mode: "cors" },
        ORIGIN
      )
    ).toBe("asset");
  });

  it("leaves everything else alone", () => {
    expect(
      handlingOf(
        { url: `${ORIGIN}/api/v1/quests`, method: "GET", mode: "cors" },
        ORIGIN
      )
    ).toBe("network");
    expect(
      handlingOf({ ...page("/quest/trail"), method: "POST" }, ORIGIN)
    ).toBe("network");
    expect(handlingOf(page("/assets/x.js"), "https://elsewhere.example")).toBe(
      "network"
    );
  });
});
