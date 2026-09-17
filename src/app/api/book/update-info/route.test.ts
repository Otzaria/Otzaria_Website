import { describe, it, expect, vi, beforeEach } from "vitest";

const { getServerSession, findByIdAndUpdateMock } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  findByIdAndUpdateMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession,
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/Book", () => ({
  default: { findByIdAndUpdate: findByIdAndUpdateMock },
}));

vi.mock("@/lib/roles", () => ({
  hasBookLibraryAccess: (role: string) => role === "admin_books" || role === "admin",
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

describe("POST /api/book/update-info - auth", () => {
  beforeEach(() => {
    getServerSession.mockReset();
    findByIdAndUpdateMock.mockReset();
  });

  it("returns 401 (not 403) when there is no session at all", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest({ bookId: "b1", editingInfo: "x" }));

    expect(res.status).toBe(401);
    expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 403 when logged in but without book-library access", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", role: "user" } });

    const res = await POST(makeRequest({ bookId: "b1", editingInfo: "x" }));

    expect(res.status).toBe(403);
    expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
  });

  it("allows an admin to update the book info", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", role: "admin_books" } });
    findByIdAndUpdateMock.mockResolvedValue({ _id: "b1" });

    const res = await POST(makeRequest({ bookId: "b1", editingInfo: "x" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
