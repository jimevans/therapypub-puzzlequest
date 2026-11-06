import { describe, expect, it } from "vitest";
import { newName, phoneNumber } from "../../src/schemas/common.js";

describe("phoneNumber", () => {
  it.each([
    ["(312) 555-0142", "+13125550142"],
    ["312-555-0142", "+13125550142"],
    ["312.555.0142", "+13125550142"],
    ["3125550142", "+13125550142"],
    ["1 312 555 0142", "+13125550142"],
    ["+1 (312) 555-0142", "+13125550142"],
    ["+13125550142", "+13125550142"],
    ["+1 416 555 0199", "+14165550199"],
    ["  312 555 0142  ", "+13125550142"],
    ["", ""],
  ])("stores %j as %j", (typed, stored) => {
    expect(phoneNumber.parse(typed)).toBe(stored);
  });

  it.each([
    ["a number outside +1", "+44 20 7946 0958"],
    ["a number with an unassigned area code", "555-123-4567"],
    ["too few digits", "555-0142"],
    ["letters", "call me"],
  ])("rejects %s", (_, typed) => {
    const result = phoneNumber.safeParse(typed);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "Enter a valid US or Canadian phone number"
    );
  });
});

describe("newName", () => {
  it("trims the name", () => {
    expect(newName.parse("  quest  ")).toBe("quest");
  });

  it.each([
    ["an empty name", "  ", "Required"],
    ["a name with a slash", "a/b", 'Must not contain "/"'],
    ["a long name", "x".repeat(101), "Must be at most 100 characters"],
  ])("rejects %s", (_, name, message) => {
    expect(newName.safeParse(name).error?.issues[0].message).toBe(message);
  });
});
