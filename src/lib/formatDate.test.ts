import { describe, it, expect } from "vitest";
import { formatDateShort, formatDateWithTime, formatDateFull } from "./formatDate";

// תאריך ייחוס קבוע: 15 במרץ 2025, 09:05 (שעון מקומי)
const REF = new Date(2025, 2, 15, 9, 5);

describe("formatDateShort", () => {
  it("formats as day.month.year with no extra options", () => {
    expect(formatDateShort(REF)).toBe("15.3.2025");
  });

  it("accepts a timestamp or ISO string input", () => {
    expect(formatDateShort(REF.getTime())).toBe("15.3.2025");
    expect(formatDateShort(REF.toISOString())).not.toBe("");
  });
});

describe("formatDateWithTime", () => {
  it("formats with day, long month name, hour and minute (no year)", () => {
    expect(formatDateWithTime(REF)).toBe("15 במרץ בשעה 09:05");
  });
});

describe("formatDateFull", () => {
  it("formats with day, long month name and year (no time)", () => {
    expect(formatDateFull(REF)).toBe("15 במרץ 2025");
  });
});
