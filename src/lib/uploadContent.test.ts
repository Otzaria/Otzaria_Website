import { describe, it, expect } from "vitest";
import { combineUploadsContent } from "./uploadContent";

describe("combineUploadsContent", () => {
  it("returns an empty string for an empty list", () => {
    expect(combineUploadsContent([])).toBe("");
  });

  it("returns the content unchanged for a single upload", () => {
    expect(combineUploadsContent(["תוכן יחיד"])).toBe("תוכן יחיד");
  });

  it("joins multiple uploads with the '---' separator between them, but not after the last one", () => {
    expect(combineUploadsContent(["חלק א", "חלק ב", "חלק ג"])).toBe(
      "חלק א\n\n---\n\nחלק ב\n\n---\n\nחלק ג"
    );
  });

  it("treats empty-string content as a valid part and still separates it", () => {
    expect(combineUploadsContent(["", "חלק ב"])).toBe("\n\n---\n\nחלק ב");
  });

  it("stringifies undefined/null content via concatenation, matching the original inline logic", () => {
    // ה-route המקורי לא סינן ערכים חסרים לפני האיחוד - התנהגות זו משוחזרת כאן במדויק
    expect(combineUploadsContent([undefined as unknown as string, "חלק ב"])).toBe(
      "undefined\n\n---\n\nחלק ב"
    );
  });
});
