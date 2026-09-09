import { describe, it, expect, vi, beforeEach } from "vitest";

const { getServerSessionMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/lib/roles", () => ({
  hasBookLibraryAccess: (role: string) =>
    role === "admin_books" || role === "admin" || role === "admin_books_only",
}));

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/OcrJob", () => ({
  default: { updateOne: vi.fn() },
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

describe("POST /api/admin/books/ocr/cancel - auth", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
  });

  // רגרסיה: לפני התיקון הראוט החזיר 401 גם למשתמש מחובר בלי הרשאה (במקום 403).
  it("returns 401 when there is no session at all", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const res = await POST(makeRequest({ bookId: "507f1f77bcf86cd799439011" }));

    expect(res.status).toBe(401);
  });

  it("returns 403 when a session exists but the role lacks access", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "user" } });

    const res = await POST(makeRequest({ bookId: "507f1f77bcf86cd799439011" }));

    expect(res.status).toBe(403);
  });
});
