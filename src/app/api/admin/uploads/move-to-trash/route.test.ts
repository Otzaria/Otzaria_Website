import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidateTagMock, findByIdAndUpdateMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  findByIdAndUpdateMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
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

vi.mock("@/models/Upload", () => ({
  default: { findByIdAndUpdate: findByIdAndUpdateMock },
}));

import { CACHE_TAGS } from "@/lib/cacheTags";
import { PUT } from "./route";

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

describe("PUT /api/admin/uploads/move-to-trash", () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
    findByIdAndUpdateMock.mockReset();
  });

  it("invalidates the admin uploads list cache tag after a successful move to trash", async () => {
    findByIdAndUpdateMock.mockResolvedValue({ _id: "u1", isDeleted: true, deletedAt: new Date() });

    const res = await PUT(makeRequest({ uploadId: "u1" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.UPLOADS_ADMIN_LIST, { expire: 0 });
  });

  it("does not invalidate the cache when the upload is not found", async () => {
    findByIdAndUpdateMock.mockResolvedValue(null);

    const res = await PUT(makeRequest({ uploadId: "missing" }));

    expect(res.status).toBe(404);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("does not invalidate the cache when the caller lacks access", async () => {
    const { getServerSession } = await import("next-auth");
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      user: { id: "u1", role: "user" },
    });

    const res = await PUT(makeRequest({ uploadId: "u1" }));

    expect(res.status).toBe(403);
    expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  // רגרסיה: לפני המעבר ל-requireAccess, חוסר session היה מוחזר כ-403 בדיוק כמו
  // חוסר הרשאה. כעת 401 מיועד במפורש למקרה שאין session בכלל.
  it("returns 401 instead of 403 when there is no session at all", async () => {
    const { getServerSession } = await import("next-auth");
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await PUT(makeRequest({ uploadId: "u1" }));

    expect(res.status).toBe(401);
    expect(findByIdAndUpdateMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
