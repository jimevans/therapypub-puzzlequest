import { afterEach, describe, expect, it } from "vitest";
import { shareLinkAddress, shareLinkRequest } from "./shareLink";

afterEach(() => {
  location.hash = "";
  sessionStorage.clear();
});

describe("share links", () => {
  it("makes an address with the token where servers won't see it", () => {
    expect(shareLinkAddress("old town", "secret")).toBe(
      `${location.origin}/monitor/quest/old%20town#share=secret`
    );
  });

  it("makes a big screen's address with the same token", () => {
    expect(shareLinkAddress("old town", "secret", "board")).toBe(
      `${location.origin}/monitor/quest/old%20town/board#share=secret`
    );
  });

  it("sends nothing without a link", () => {
    expect(shareLinkRequest("trail")).toEqual({});
  });

  it("sends the token from the address", () => {
    location.hash = "#share=secret";

    expect(shareLinkRequest("trail")).toEqual({
      headers: { "X-Share-Token": "secret" },
    });
  });

  it("keeps it for the quest after the address changes", () => {
    location.hash = "#share=secret";
    shareLinkRequest("trail");
    location.hash = "";

    expect(shareLinkRequest("trail")).toEqual({
      headers: { "X-Share-Token": "secret" },
    });
    expect(shareLinkRequest("other")).toEqual({});
  });
});
