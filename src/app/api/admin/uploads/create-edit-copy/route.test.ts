import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidateTagMock, findOneMock, findMock, updateManyMock, getUploadTextMock, saveMock, FakeUploadEditCopy } = vi.hoisted(() => {
  const saveMock = vi.fn();
  class FakeUploadEditCopy {
    _id = "copy-1";
    save = saveMock;
    constructor(fields: Record<string, unknown>) {
      Object.assign(this, fields);
    }
  }
  return {
    revalidateTagMock: vi.fn(),
    findOneMock: vi.fn(),
    findMock: vi.fn(),
    updateManyMock: vi.fn(),
    getUploadTextMock: vi.fn(),
    saveMock,
    FakeUploadEditCopy,
  };
});

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

vi.mock("@/lib/gridfs-service", () => ({
  getUploadText: getUploadTextMock,
}));

vi.mock("@/models/UploadEditCopy", () => ({
  default: FakeUploadEditCopy,
}));

vi.mock("@/models/Upload", () => ({
  default: { findOne: findOneMock, find: findMock, updateMany: updateManyMock },
}));

import { CACHE_TAGS } from "@/lib/cacheTags";
import { POST } from "./route";

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

function makeQuery(uploads: unknown[]) {
  return { sort: vi.fn().mockResolvedValue(uploads) };
}

describe("POST /api/admin/uploads/create-edit-copy", () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
    findOneMock.mockReset();
    findMock.mockReset();
    updateManyMock.mockReset();
    getUploadTextMock.mockReset();
    saveMock.mockReset().mockResolvedValue(undefined);
  });

  it("creates an edit copy from the combined upload content and invalidates the cache", async () => {
    findOneMock.mockResolvedValue(null);
    findMock.mockReturnValue(makeQuery([{ bookName: "ספר" }]));
    getUploadTextMock.mockResolvedValue("תוכן");
    updateManyMock.mockResolvedValue({ modifiedCount: 1 });

    const res = await POST(makeRequest({ uploadIds: ["u1"], bookName: "שם" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.UPLOADS_ADMIN_LIST, { expire: 0 });
  });

  it("rejects when an edit copy already exists, without touching the cache", async () => {
    findOneMock.mockResolvedValue({ editCopy: "existing-copy" });

    const res = await POST(makeRequest({ uploadIds: ["u1"] }));

    expect(res.status).toBe(400);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("returns 500 instead of crashing when a DB operation throws", async () => {
    findOneMock.mockRejectedValue(new Error("connection lost"));

    const res = await POST(makeRequest({ uploadIds: ["u1"] }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBeTruthy();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
