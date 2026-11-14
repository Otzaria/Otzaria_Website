import { describe, it, expect, vi, beforeEach } from "vitest";

const { getServerSessionMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

// roles.js — המודול האמיתי (טהור): ה-route מעביר את session.user כולו (תפקידים מרובים)
vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ocr/runOcrJob", () => ({
  runOcrJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ocr/staleJobs", () => ({
  reapStaleOcrJobs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/Book", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("@/models/Page", () => ({
  default: { countDocuments: vi.fn().mockResolvedValue(0) },
}));

vi.mock("@/lib/ocr/bookOcrCounts", () => ({
  countBookOcrPages: vi.fn().mockResolvedValue({
    pagesWithImage: 5,
    editedPagesCount: 3,
    humanEditedPagesCount: 1,
    toProcess: { overwrite: 5, skip: 2, skip_edited: 4 },
  }),
}));

vi.mock("@/models/OcrJob", () => ({
  default: { findOne: vi.fn(), create: vi.fn() },
}));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

describe("POST /api/admin/books/ocr/start - auth", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
  });

  // רגרסיה: לפני התיקון הראוט החזיר 401 גם למשתמש מחובר בלי הרשאה (במקום 403).
  it("returns 401 when there is no session at all", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const res = await POST(makeRequest({ bookId: "507f1f77bcf86cd799439011", method: "ocrwin", existingTextMode: "skip" }));

    expect(res.status).toBe(401);
  });

  it("returns 403 when a session exists but the role lacks access", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "user" } });

    const res = await POST(makeRequest({ bookId: "507f1f77bcf86cd799439011", method: "ocrwin", existingTextMode: "skip" }));

    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/books/ocr/start - active", () => {
  const BOOK_ID = "507f1f77bcf86cd799439011";

  beforeEach(async () => {
    getServerSessionMock.mockReset();
    getServerSessionMock.mockResolvedValue({ user: { role: "admin_books", id: "u1", name: "מנהל" } });
    const Book = (await import("@/models/Book")).default as unknown as { findById: ReturnType<typeof vi.fn> };
    const Page = (await import("@/models/Page")).default as unknown as { countDocuments: ReturnType<typeof vi.fn> };
    const OcrJob = (await import("@/models/OcrJob")).default as unknown as {
      findOne: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    Book.findById.mockResolvedValue({ _id: BOOK_ID, name: "ספר", slug: "sefer" });
    // עמודים עם תמונה: 5, ערוכים: 0
    Page.countDocuments.mockReset();
    Page.countDocuments.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
    OcrJob.findOne.mockReset();
    OcrJob.create.mockReset();
    OcrJob.findOne.mockResolvedValue(null);
    OcrJob.create.mockResolvedValue({ _id: { toString: () => "job1" } });
  });

  it("יוצר את העבודה עם active:true ובודק עבודה פעילה לפי activeFilter", async () => {
    const OcrJob = (await import("@/models/OcrJob")).default as unknown as {
      findOne: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };

    const res = await POST(makeRequest({ bookId: BOOK_ID, method: "ocrwin", existingTextMode: "overwrite" }));

    expect(res.status).toBe(200);
    expect(OcrJob.create).toHaveBeenCalledTimes(1);
    expect(OcrJob.create.mock.calls[0][0]).toMatchObject({ status: "running", active: true, method: "ocrwin" });
    expect(OcrJob.findOne).toHaveBeenCalledWith({
      book: BOOK_ID,
      $or: [{ active: true }, { active: { $exists: false }, status: "running" }],
    });
  });

  it("skip_edited: totalPages לפי ספירת המצב; אין מה לעבד → 400 עם הודעת המצב", async () => {
    const OcrJob = (await import("@/models/OcrJob")).default as unknown as { create: ReturnType<typeof vi.fn> };
    const { countBookOcrPages } = (await import("@/lib/ocr/bookOcrCounts")) as unknown as {
      countBookOcrPages: ReturnType<typeof vi.fn>;
    };

    const res = await POST(makeRequest({ bookId: BOOK_ID, method: "ocrwin", existingTextMode: "skip_edited" }));
    expect(res.status).toBe(200);
    expect(OcrJob.create.mock.calls[0][0]).toMatchObject({ existingTextMode: "skip_edited", totalPages: 4, editedPagesCount: 3 });

    countBookOcrPages.mockResolvedValueOnce({
      pagesWithImage: 5, editedPagesCount: 5, humanEditedPagesCount: 5, toProcess: { overwrite: 5, skip: 0, skip_edited: 0 },
    });
    const none = await POST(makeRequest({ bookId: BOOK_ID, method: "ocrwin", existingTextMode: "skip_edited" }));
    expect(none.status).toBe(400);
    expect((await none.json()).error).toMatch(/נערכו או נתפסו/);
  });

  it("עבודה פעילה קיימת → 409 בלי create", async () => {
    const OcrJob = (await import("@/models/OcrJob")).default as unknown as {
      findOne: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    OcrJob.findOne.mockResolvedValue({ _id: { toString: () => "old" } });

    const res = await POST(makeRequest({ bookId: BOOK_ID, method: "ocrwin", existingTextMode: "overwrite" }));

    expect(res.status).toBe(409);
    expect(OcrJob.create).not.toHaveBeenCalled();
  });

  it("11000 מהאינדקס הייחודי (race) → 409", async () => {
    const OcrJob = (await import("@/models/OcrJob")).default as unknown as {
      create: ReturnType<typeof vi.fn>;
    };
    OcrJob.create.mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }));

    const res = await POST(makeRequest({ bookId: BOOK_ID, method: "ocrwin", existingTextMode: "overwrite" }));

    expect(res.status).toBe(409);
  });
});
