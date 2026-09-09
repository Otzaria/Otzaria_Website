import { describe, it, expect, vi, beforeEach } from "vitest";

const { getServerSession, findByIdMock } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  findByIdMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession,
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/DictaBook", () => ({
  default: { findById: findByIdMock, findOne: vi.fn().mockResolvedValue(null) },
}));

vi.mock("@/lib/roles", () => ({
  hasBooksAccess: (role: string) => role === "admin_books" || role === "admin",
}));

vi.mock("@/lib/cacheTags", () => ({
  CACHE_TAGS: { DICTA_BOOKS_ADMIN_LIST: "dicta-books-admin-list" },
  revalidateNow: vi.fn(),
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

describe("POST /api/dicta/books/split - auth", () => {
  beforeEach(() => {
    getServerSession.mockReset();
    findByIdMock.mockReset();
  });

  it("returns 401 (not 403) when there is no session at all", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest({}));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBeTruthy();
  });

  it("returns 403 when logged in but without books access", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", role: "user" } });

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(403);
  });

  it("passes the auth gate for a books-admin (proceeds to the missing-params check)", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", role: "admin_books" } });

    const res = await POST(makeRequest({}));
    const body = await res.json();

    // גישה אושרה - הבקשה נכשלת בהמשך על חסרים פרמטרים (400), לא על הרשאות
    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
  });
});
