import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidateTagMock, findByIdMock, findByIdAndDeleteMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  findByIdMock: vi.fn(),
  findByIdAndDeleteMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
}));

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/DictaBook", () => ({
  default: { findById: findByIdMock, findByIdAndDelete: findByIdAndDeleteMock },
}));

vi.mock("@/models/UploadEditCopy", () => ({
  default: { findById: vi.fn(), findByIdAndDelete: vi.fn() },
}));

vi.mock("@/models/Upload", () => ({
  default: { updateMany: vi.fn() },
}));

vi.mock("@/models/User", () => ({
  default: { findByIdAndUpdate: vi.fn() },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "admin-1", role: "admin_books" } }),
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/lib/roles", () => ({
  hasBooksAccess: (role: string) => role === "admin_books" || role === "admin",
}));

vi.mock("../../_auth", () => ({
  requireBooksAccessOrForbidden: vi.fn().mockResolvedValue({
    ok: true,
    session: { user: { id: "admin-1", role: "admin_books" } },
  }),
}));

import { CACHE_TAGS } from "@/lib/cacheTags";
import { DELETE } from "./route";

function makeRequest() {
  return {} as Request;
}

describe("DELETE /api/dicta/books/[id]", () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
    findByIdMock.mockReset();
    findByIdAndDeleteMock.mockReset();
  });

  it("invalidates the admin dicta books list cache tag after a successful delete", async () => {
    findByIdMock.mockResolvedValue({ _id: "b1", title: "ספר" });
    findByIdAndDeleteMock.mockResolvedValue({ _id: "b1" });

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "b1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(findByIdAndDeleteMock).toHaveBeenCalledWith("b1");
    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.DICTA_BOOKS_ADMIN_LIST, { expire: 0 });
  });

  it("does not invalidate the cache when the book is not found", async () => {
    findByIdMock.mockResolvedValue(null);

    const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: "missing" }) });

    expect(res.status).toBe(404);
    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
