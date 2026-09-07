import { describe, it, expect } from "vitest";
import { toHebrew, toNumber, isGematria, stripTags } from "./gematria";

describe("toHebrew", () => {
  it("converts small numbers to Hebrew numerals", () => {
    expect(toHebrew(1)).toBe("א");
    expect(toHebrew(10)).toBe("י");
  });

  it("uses the טו/טז exception instead of יה/יו for 15 and 16", () => {
    expect(toHebrew(15)).toBe("טו");
    expect(toHebrew(16)).toBe("טז");
  });

  it("combines hundreds/tens/ones for larger numbers", () => {
    // 424 = ת(400) + כ(20) + ד(4)
    expect(toHebrew(424)).toBe("תכד");
  });

  it("returns an empty string for zero or negative input", () => {
    expect(toHebrew(0)).toBe("");
    expect(toHebrew(-5)).toBe("");
  });
});

describe("toNumber", () => {
  it("is the inverse of toHebrew for round numbers", () => {
    expect(toNumber("תכד")).toBe(424);
    expect(toNumber(toHebrew(123))).toBe(123);
  });

  it("maps final-form letters (סופיות) to their regular value", () => {
    // ך (final kaf) should be worth the same as כ (20)
    expect(toNumber("ך")).toBe(20);
  });

  it("returns 0 for empty or non-Hebrew input", () => {
    expect(toNumber("")).toBe(0);
    expect(toNumber("abc")).toBe(0);
  });
});

describe("stripTags", () => {
  it("removes every occurrence of each given tag", () => {
    expect(stripTags("<b>הלכה</b> א", ["<b>", "</b>"])).toBe("הלכה א");
  });

  it("leaves the text unchanged when no tag matches", () => {
    expect(stripTags("שלום", ["<b>", "</b>"])).toBe("שלום");
  });
});

describe("isGematria", () => {
  it("recognizes a Hebrew numeral within the (exclusive) end range as gematria", () => {
    // end is exclusive: with end=10 only toHebrew(1..9) are considered valid
    expect(isGematria("א", 10)).toBe(true);
    expect(isGematria("ט", 10)).toBe(true);
  });

  it("rejects a numeral at or beyond the requested (exclusive) end", () => {
    // end=3 means only toHebrew(1..2) are valid; ג (3) should not match
    expect(isGematria("ג", 3)).toBe(false);
  });

  it("recognizes the fixed set of final-form-letter suffixed words (aa+bb combos)", () => {
    // "קם" = "ק" (from aa) + "ם" (from bb) is one of the hardcoded appendList combos
    expect(isGematria("קם", 10)).toBe(true);
  });

  it("strips known decorative tags/punctuation before comparing", () => {
    expect(isGematria('<b>א".</b>', 10)).toBe(true);
  });
});
