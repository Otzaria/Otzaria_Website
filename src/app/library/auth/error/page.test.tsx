import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AuthErrorPage from "./page";

async function renderWith(params: { error?: string | string[] }) {
  const element = await AuthErrorPage({ searchParams: Promise.resolve(params) });
  return render(element);
}

describe("AuthErrorPage (server component)", () => {
  it("shows the message for a known error code", async () => {
    await renderWith({ error: "AccessDenied" });
    expect(screen.getByText("הגישה נדחתה")).toBeTruthy();
    expect(screen.queryByText("הרשמה")).toBeNull();
  });

  it("offers registration for GoogleNoAccount", async () => {
    await renderWith({ error: "GoogleNoAccount" });
    expect(screen.getByText("הרשמה")).toBeTruthy();
  });

  it("falls back to the default message for unknown / missing / prototype keys", async () => {
    for (const params of [{}, { error: "Nope" }, { error: "constructor" }, { error: ["Verification", "x"] }]) {
      const { unmount } = await renderWith(params);
      const expected = Array.isArray(params.error) ? "שגיאה באימות" : "אירעה שגיאה בהתחברות";
      expect(screen.getByText(expected)).toBeTruthy();
      unmount();
    }
  });
});
