import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMock } = vi.hoisted(() => ({ findMock: vi.fn() }));

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/BookAcronym", () => ({
  default: { find: findMock },
}));

function makeQuery(result: unknown) {
  return {
    sort: () => ({
      select: () => ({
        lean: () => Promise.resolve(result),
      }),
    }),
  };
}

import { invalidate } from "@/lib/api-cache";
import { GET } from "./route";

describe("GET /api/book-acronyms/export-json", () => {
  beforeEach(() => {
    findMock.mockReset();
    invalidate("book-acronyms-export-json");
  });

  it("sorts by bookId (as a locale-compared string) then by Hebrew term", async () => {
    findMock.mockReturnValue(
      makeQuery([
        { externalId: "10", aliases: ["ב", "א"] },
        { externalId: "2", aliases: ["ג"] },
      ])
    );

    const res = await GET();
    const body = await res.json();

    // bookId is compared with String(...).localeCompare(..., 'en'), i.e. as
    // text, not numerically — "10" sorts before "2" (first char '1' < '2').
    expect(body).toEqual([
      { bookId: 10, term: "א" },
      { bookId: 10, term: "ב" },
      { bookId: 2, term: "ג" },
    ]);
  });

  it("drops empty/non-string aliases", async () => {
    findMock.mockReturnValue(
      makeQuery([{ externalId: "1", aliases: ["", "  ", "טוב", null] }])
    );

    const res = await GET();
    const body = await res.json();
    expect(body).toEqual([{ bookId: 1, term: "טוב" }]);
  });

  it("only queries the database once across repeated calls (cached)", async () => {
    findMock.mockReturnValue(makeQuery([{ externalId: "1", aliases: ["א"] }]));

    await GET();
    await GET();

    expect(findMock).toHaveBeenCalledTimes(1);
  });

  it("sets short-lived public cache headers (public, non-user-dependent export)", async () => {
    findMock.mockReturnValue(makeQuery([]));
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=120, stale-while-revalidate=300"
    );
  });
});
