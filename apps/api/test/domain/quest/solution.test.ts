import { describe, expect, it } from "vitest";
import {
  containsAllKeywords,
  normalize,
  parseSolutionKeywords,
} from "../../../src/domain/quest/solution.js";

describe("normalize", () => {
  it.each([
    ["O'Neil", "oneil"],
    ["ONeil", "oneil"],
    ["o neil", "oneil"],
    ["  Well-Known\tFact! ", "wellknownfact"],
    ["Café", "cafe"],
    ["ＦＵＬＬＷＩＤＴＨ", "fullwidth"],
    ["“curly” ‘quotes’", "curlyquotes"],
    ["C++ & 🦊", "c++🦊"],
    ["", ""],
  ])("normalizes %j to %j", (text, expected) => {
    expect(normalize(text)).toBe(expected);
  });
});

describe("parseSolutionKeywords", () => {
  it("splits on commas and trims each keyword", () => {
    expect(parseSolutionKeywords(" red , fox,jumps ")).toEqual([
      "red",
      "fox",
      "jumps",
    ]);
  });

  it("drops blank keywords", () => {
    expect(parseSolutionKeywords("red,, ,fox,")).toEqual(["red", "fox"]);
  });

  it("returns no keywords for an empty string", () => {
    expect(parseSolutionKeywords("")).toEqual([]);
  });
});

describe("containsAllKeywords", () => {
  it("accepts a guess containing every keyword, in any order", () => {
    expect(containsAllKeywords("the fox is red", ["red", "fox"])).toBe(true);
  });

  it("rejects a guess missing a keyword", () => {
    expect(containsAllKeywords("the fox", ["red", "fox"])).toBe(false);
  });

  it("matches keywords as substrings", () => {
    expect(containsAllKeywords("concatenate", ["cat"])).toBe(true);
  });

  it("ignores case, accents, punctuation, and spacing", () => {
    expect(containsAllKeywords("Shaquille o neil", ["O'Neil"])).toBe(true);
    expect(containsAllKeywords("CAFE", ["café"])).toBe(true);
    expect(containsAllKeywords("well known", ["well-known"])).toBe(true);
  });

  it("treats regular expression characters literally", () => {
    expect(containsAllKeywords("c++", ["c++"])).toBe(true);
    expect(containsAllKeywords("cc", ["c+"])).toBe(false);
  });

  it("matches a punctuation-only keyword literally", () => {
    expect(containsAllKeywords("what?", ["?"])).toBe(true);
    expect(containsAllKeywords("what", ["?"])).toBe(false);
  });

  it("accepts any guess when there are no keywords", () => {
    expect(containsAllKeywords("anything", [])).toBe(true);
  });
});
