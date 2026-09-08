import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  revalidateTagMock,
  findByIdMock,
  findByIdAndDeleteMock,
  pageDeleteManyMock,
  pathExistsMock,
} = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  findByIdMock: vi.fn(),
  findByIdAndDeleteMock: vi.fn(),
  pageDeleteManyMock: vi.fn().mockResolvedValue(undefined),
  pathExistsMock: vi.fn().mockResolvedValue(false),
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
  hasBookLibraryAccess: (role: string) => role === "admin_books" || role === "admin",
}));

vi.mock("fs-extra", () => ({
  default: {
    pathExists: pathExistsMock,
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/models/Book", () => ({
  default: { findById: findByIdMock, findByIdAndDelete: findByIdAndDeleteMock },
}));

vi.mock("@/models/Page", () => ({
  default: { deleteMany: pageDeleteManyMock },
}));

import { CACHE_TAGS } from "@/lib/cacheTags";
import { DELETE } from "./route";

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

describe("DELETE /api/admin/books/delete", () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
    findByIdMock.mockReset();
    findByIdAndDeleteMock.mockReset();
    pageDeleteManyMock.mockClear();
  });

  it("invalidates the admin books list cache tag after a successful delete", async () => {
    findByIdMock.mockResolvedValue({ _id: "b1", folderPath: null });
    findByIdAndDeleteMock.mockResolvedValue({ _id: "b1" });

    const res = await DELETE(makeRequest({ bookId: "b1" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(findByIdAndDeleteMock).toHaveBeenCalledWith("b1");
    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.BOOKS_ADMIN_LIST);
  });

  it("does not invalidate the cache when the book is not found", async () => {
    findByIdMock.mockResolvedValue(null);

    const res = await DELETE(makeRequest({ bookId: "missing" }));

    expect(res.status).toBe(404);
    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
