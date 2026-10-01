import { describe, it, expect, vi, beforeEach } from "vitest";

const { bookFindMock, aggregateMock } = vi.hoisted(() => ({
  bookFindMock: vi.fn(),
  aggregateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/models/Book", () => ({ default: { find: bookFindMock } }));
vi.mock("@/models/Page", () => ({ default: { aggregate: aggregateMock } }));

import { getServerSession } from "next-auth";
import { GET } from "./route";

const sessionMock = getServerSession as unknown as ReturnType<typeof vi.fn>;

const rawBooks = [
  {
    _id: "b1",
    name: "ספר א",
    slug: "sefer-a",
    totalPages: 10,
    category: "הלכה",
    updatedAt: "2026-01-01T00:00:00.000Z",
    editingInfo: { title: "הנחיות", sections: [] },
    ownerId: null,
    originalOwnerId: { _id: "u9", name: "ראובן" },
  },
];

function chain(result: unknown) {
  const q = {
    select: vi.fn(() => q),
    populate: vi.fn(() => q),
    sort: vi.fn(() => q),
    lean: vi.fn(async () => result),
  };
  return q;
}

describe("GET /api/library/list", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    bookFindMock.mockReset();
    aggregateMock.mockReset();
    sessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    aggregateMock.mockResolvedValue([{ _id: "b1", completed: 4, inProgress: 1 }]);
  });

  it("returns the full rows without ?view (admin pages rely on it)", async () => {
    const q = chain(rawBooks);
    bookFindMock.mockReturnValue(q);
    const res = await GET(new Request("http://x/api/library/list"));
    const { books } = await res.json();
    expect(books[0]).toMatchObject({
      id: "b1",
      path: "sefer-a",
      completedPages: 4,
      inProgressPages: 1,
      availablePages: 5,
      editingInfo: { title: "הנחיות", sections: [] },
      lastUpdated: "2026-01-01T00:00:00.000Z",
      originalOwnerId: "u9",
      originalOwnerName: "ראובן",
      ownerName: null,
    });
    expect(q.populate).toHaveBeenCalledWith("originalOwnerId", "name");
  });

  it("?view=catalog keeps the catalog fields and drops editingInfo/owner names", async () => {
    const q = chain(rawBooks);
    bookFindMock.mockReturnValue(q);
    const res = await GET(new Request("http://x/api/library/list?view=catalog"));
    const { books } = await res.json();
    expect(books[0]).toEqual({
      id: "b1",
      name: "ספר א",
      path: "sefer-a",
      thumbnail: "/uploads/books/sefer-a/page.1.jpg",
      totalPages: 10,
      completedPages: 4,
      inProgressPages: 1,
      availablePages: 5,
      category: "הלכה",
      status: "in-progress",
      isHidden: false,
      ownerId: null,
      isPrivate: false,
    });
    expect(q.select).toHaveBeenCalledWith(expect.not.stringContaining("editingInfo"));
    expect(q.populate).not.toHaveBeenCalledWith("originalOwnerId", "name");
  });

  it("non-admins still never get hidden books", async () => {
    bookFindMock.mockReturnValue(chain([]));
    await GET(new Request("http://x/api/library/list?view=catalog"));
    expect(bookFindMock).toHaveBeenCalledWith({ isHidden: { $ne: true } });
  });
});
