import { describe, it, expect, vi, beforeEach } from "vitest";

const { bookFindOneMock, pageFindMock } = vi.hoisted(() => ({
  bookFindOneMock: vi.fn(),
  pageFindMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/models/Book", () => ({ default: { findOne: bookFindOneMock } }));
vi.mock("@/models/Page", () => ({ default: { find: pageFindMock } }));

import { getServerSession } from "next-auth";
import { GET } from "./route";

const sessionMock = getServerSession as unknown as ReturnType<typeof vi.fn>;

const book = { _id: "b1", name: "ספר", slug: "sefer", totalPages: 3, completedPages: 1 };
const rawPages = [
  { _id: "p1", pageNumber: 1, status: "completed", imagePath: "/uploads/books/sefer/page.1.jpg", claimedBy: { _id: "u1", name: "משה" } },
  { _id: "p2", pageNumber: 2, status: "available", imagePath: "/uploads/books/sefer/page.2.jpg", claimedBy: null },
];

function chain(result: unknown) {
  const q = {
    sort: vi.fn(() => q),
    select: vi.fn(() => q),
    populate: vi.fn(() => q),
    lean: vi.fn(async () => result),
  };
  return q;
}

function call(url: string) {
  return GET(new Request(url), { params: Promise.resolve({ id: "sefer" }) });
}

describe("GET /api/book/[id]", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    bookFindOneMock.mockReset();
    pageFindMock.mockReset();
    sessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    bookFindOneMock.mockReturnValue({ lean: async () => book });
  });

  it("returns every page of the book without ?page", async () => {
    pageFindMock.mockReturnValue(chain(rawPages));
    const res = await call("http://x/api/book/sefer");
    expect(res.status).toBe(200);
    expect(pageFindMock).toHaveBeenCalledWith({ book: "b1" });
    const body = await res.json();
    expect(body.pages).toHaveLength(2);
    expect(body.pages[0]).toMatchObject({ id: "p1", number: 1, claimedBy: "משה", claimedById: "u1" });
    expect(body.book).toMatchObject({ id: "b1", slug: "sefer", path: "sefer", totalPages: 3 });
  });

  it("?page=N queries only that page and keeps the same response shape", async () => {
    pageFindMock.mockReturnValue(chain([rawPages[1]]));
    const res = await call("http://x/api/book/sefer?page=2");
    expect(pageFindMock).toHaveBeenCalledWith({ book: "b1", pageNumber: 2 });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.pages).toEqual([
      expect.objectContaining({ id: "p2", number: 2, status: "available", thumbnail: "/uploads/books/sefer/page.2.jpg" }),
    ]);
    expect(body.book).toMatchObject({ id: "b1", totalPages: 3 });
  });

  it("ignores a non-numeric ?page and falls back to the full list", async () => {
    pageFindMock.mockReturnValue(chain(rawPages));
    await call("http://x/api/book/sefer?page=NaN");
    expect(pageFindMock).toHaveBeenCalledWith({ book: "b1" });
  });

  it("still requires a session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await call("http://x/api/book/sefer?page=2");
    expect(res.status).toBe(401);
    expect(pageFindMock).not.toHaveBeenCalled();
  });
});
