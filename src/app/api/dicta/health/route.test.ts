import { describe, expect, it } from "vitest";
import { isProtectedPath } from "@/lib/protected-routes";
import { GET } from "./route";

describe("GET /api/dicta/health — תאימות לבדיקת הפריסה", () => {
  it("מחזיר את קוד ההצלחה ואת גוף התשובה המדויק שסקריפט הפריסה דורש", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.text()).toBe('{"status":"ok"}');
  });

  it("נשאר נגיש לבדיקת הפריסה ללא התחברות", () => {
    expect(isProtectedPath("/api/dicta/health")).toBe(false);
  });
});
