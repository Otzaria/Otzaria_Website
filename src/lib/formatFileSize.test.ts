import { describe, it, expect } from "vitest";
import { formatFileSize } from "./formatFileSize";

describe("formatFileSize", () => {
  it("formats sub-KB sizes as bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(0)).toBe("0 B");
  });

  it("formats KB-range sizes with no decimals", () => {
    expect(formatFileSize(2048)).toBe("2 KB");
  });

  it("formats MB-range sizes with one decimal", () => {
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });

  it("treats exactly 1024 bytes as the KB boundary", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
  });

  it("treats exactly 1024*1024 bytes as the MB boundary", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1 MB");
  });
});
