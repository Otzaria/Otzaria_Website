import { describe, it, expect, vi, beforeEach } from "vitest";

const { getServerSession } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession,
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({
  authOptions: {},
}));

import { requireBooksAccessOrForbidden } from "./_auth";

describe("requireBooksAccessOrForbidden", () => {
  beforeEach(() => {
    getServerSession.mockReset();
  });

  it("returns 401 (not 403) when there is no session at all", async () => {
    getServerSession.mockResolvedValue(null);
    const result = await requireBooksAccessOrForbidden();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.json();
      expect(body).toEqual({ error: "יש להתחבר כדי לבצע פעולה זו" });
    }
  });

  it("returns 403 when logged in but without books access", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const result = await requireBooksAccessOrForbidden();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      const body = await result.response.json();
      expect(body).toEqual({ error: "אין הרשאה לבצע פעולה זו" });
    }
  });

  it("returns ok with the session when the user has books access", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "u1", role: "admin_books" },
    });
    const result = await requireBooksAccessOrForbidden();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.user.role).toBe("admin_books");
    }
  });

  it("also grants access to the full admin role", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "u2", role: "admin" },
    });
    const result = await requireBooksAccessOrForbidden();
    expect(result.ok).toBe(true);
  });
});
