import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMock, getUploadTextMock } = vi.hoisted(() => ({
  findMock: vi.fn(),
  getUploadTextMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "admin-1", role: "admin_books" } }),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/lib/roles", () => ({
  hasBooksAccess: (role: string) => role === "admin_books" || role === "admin",
}));

vi.mock("@/lib/gridfs-service", () => ({
  getUploadText: getUploadTextMock,
}));

vi.mock("@/models/Upload", () => ({
  default: { find: findMock },
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

function makeQuery(uploads: unknown[]) {
  return { sort: vi.fn().mockResolvedValue(uploads) };
}

describe("POST /api/admin/uploads/get-book-content", () => {
  beforeEach(() => {
    findMock.mockReset();
    getUploadTextMock.mockReset();
  });

  it("combines the text of all uploads in order", async () => {
    findMock.mockReturnValue(makeQuery([{ bookName: "ספר" }, { bookName: "ספר" }]));
    getUploadTextMock.mockResolvedValueOnce("חלק א").mockResolvedValueOnce("חלק ב");

    const res = await POST(makeRequest({ uploadIds: ["u1", "u2"] }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.content).toBe("חלק א\n\n---\n\nחלק ב");
    expect(data.uploadCount).toBe(2);
  });

  it("returns 404 when no uploads are found", async () => {
    findMock.mockReturnValue(makeQuery([]));

    const res = await POST(makeRequest({ uploadIds: ["missing"] }));

    expect(res.status).toBe(404);
  });

  it("returns 500 instead of crashing when a DB/GridFS operation throws", async () => {
    findMock.mockReturnValue({
      sort: vi.fn().mockRejectedValue(new Error("connection lost")),
    });

    const res = await POST(makeRequest({ uploadIds: ["u1"] }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBeTruthy();
  });

  // רגרסיה: לפני המעבר ל-requireAccess, חוסר session היה מוחזר כ-403 בדיוק כמו
  // חוסר הרשאה. כעת 401 מיועד במפורש למקרה שאין session בכלל.
  it("returns 401 when there is no session at all", async () => {
    const { getServerSession } = await import("next-auth");
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ uploadIds: ["u1"] }));

    expect(res.status).toBe(401);
    expect(findMock).not.toHaveBeenCalled();
  });

  it("returns 403 when a session exists but the role lacks access", async () => {
    const { getServerSession } = await import("next-auth");
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      user: { id: "u1", role: "user" },
    });

    const res = await POST(makeRequest({ uploadIds: ["u1"] }));

    expect(res.status).toBe(403);
    expect(findMock).not.toHaveBeenCalled();
  });
});
