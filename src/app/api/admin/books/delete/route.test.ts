import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  revalidateTagMock,
  findByIdMock,
  findByIdAndDeleteMock,
  pageDeleteManyMock,
  pageResultDeleteManyMock,
  pathExistsMock,
  cancelActiveOcrForBookMock,
  cancelLateOcrJobsQuietMock,
  removeMock,
} = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  findByIdMock: vi.fn(),
  findByIdAndDeleteMock: vi.fn(),
  pageDeleteManyMock: vi.fn().mockResolvedValue(undefined),
  pageResultDeleteManyMock: vi.fn().mockResolvedValue(undefined),
  pathExistsMock: vi.fn().mockResolvedValue(false),
  cancelActiveOcrForBookMock: vi.fn().mockResolvedValue({ cancelled: [] }),
  cancelLateOcrJobsQuietMock: vi.fn().mockResolvedValue({ cancelled: [] }),
  removeMock: vi.fn().mockResolvedValue(undefined),
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
    remove: removeMock,
  },
}));

vi.mock("@/models/Book", () => ({
  default: { findById: findByIdMock, findByIdAndDelete: findByIdAndDeleteMock },
}));

vi.mock("@/models/Page", () => ({
  default: { deleteMany: pageDeleteManyMock },
}));

vi.mock("@/models/OcrPageResult", () => ({
  default: { deleteMany: pageResultDeleteManyMock },
}));

vi.mock("@/lib/ocr/localCancel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ocr/localCancel")>();
  return {
    ...actual,
    cancelActiveOcrForBook: cancelActiveOcrForBookMock,
    cancelLateOcrJobsQuiet: cancelLateOcrJobsQuietMock,
  };
});

import { CACHE_TAGS } from "@/lib/cacheTags";
import { OcrApplyInProgressError } from "@/lib/ocr/localCancel";
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
    pageResultDeleteManyMock.mockClear();
    pathExistsMock.mockReset();
    pathExistsMock.mockResolvedValue(false);
    removeMock.mockClear();
    cancelActiveOcrForBookMock.mockReset();
    cancelActiveOcrForBookMock.mockResolvedValue({ cancelled: [] });
    cancelLateOcrJobsQuietMock.mockClear();
  });

  it("invalidates the admin books list cache tag after a successful delete", async () => {
    findByIdMock.mockResolvedValue({ _id: "b1", folderPath: null });
    findByIdAndDeleteMock.mockResolvedValue({ _id: "b1" });

    const res = await DELETE(makeRequest({ bookId: "b1" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(findByIdAndDeleteMock).toHaveBeenCalledWith("b1");
    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.BOOKS_ADMIN_LIST, { expire: 0 });
  });

  it("does not invalidate the cache when the book is not found", async () => {
    findByIdMock.mockResolvedValue(null);

    const res = await DELETE(makeRequest({ bookId: "missing" }));

    expect(res.status).toBe(404);
    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  // רגרסיה: לפני המעבר ל-requireAccess, חוסר session היה מוחזר כ-403 בדיוק כמו
  // חוסר הרשאה. כעת 401 מיועד במפורש למקרה שאין session בכלל.
  it("returns 401 when there is no session at all", async () => {
    const { getServerSession } = await import("next-auth");
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await DELETE(makeRequest({ bookId: "b1" }));

    expect(res.status).toBe(401);
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it("returns 403 when a session exists but the role lacks access", async () => {
    const { getServerSession } = await import("next-auth");
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      user: { id: "u1", role: "user" },
    });

    const res = await DELETE(makeRequest({ bookId: "b1" }));

    expect(res.status).toBe(403);
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it("מבטל עבודת OCR פעילה (מתועד) לפני מחיקת קבצים ועמודים, וסבב שני אחרי מחיקת הספר", async () => {
    findByIdMock.mockResolvedValue({ _id: "b1", folderPath: "/uploads/books/b1" });
    findByIdAndDeleteMock.mockResolvedValue({ _id: "b1" });
    pathExistsMock.mockResolvedValue(true);

    const res = await DELETE(makeRequest({ bookId: "b1" }));

    expect(res.status).toBe(200);
    expect(cancelActiveOcrForBookMock).toHaveBeenCalledWith("b1", { reason: "book_deleted", byName: "" });
    const cancelOrder = cancelActiveOcrForBookMock.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(removeMock.mock.invocationCallOrder[0]);
    expect(cancelOrder).toBeLessThan(pageDeleteManyMock.mock.invocationCallOrder[0]);
    // נתוני OCR מקומי לעמודים (OcrPageResult) נמחקים יחד עם העמודים
    expect(pageResultDeleteManyMock).toHaveBeenCalledWith({ book: "b1" });
    expect(cancelOrder).toBeLessThan(findByIdAndDeleteMock.mock.invocationCallOrder[0]);
    expect(cancelLateOcrJobsQuietMock).toHaveBeenCalledWith(["b1"], { reason: "book_deleted", byName: "" });
    expect(cancelLateOcrJobsQuietMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      findByIdAndDeleteMock.mock.invocationCallOrder[0]
    );
  });

  it("שם המבטל נלקח מה-session", async () => {
    const { getServerSession } = await import("next-auth");
    (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      user: { id: "admin-1", role: "admin_books", name: "מנהל ספרים" },
    });
    findByIdMock.mockResolvedValue({ _id: "b1", folderPath: null });

    await DELETE(makeRequest({ bookId: "b1" }));

    expect(cancelActiveOcrForBookMock).toHaveBeenCalledWith("b1", { reason: "book_deleted", byName: "מנהל ספרים" });
  });

  it("קליטת תוצאות OCR בעיצומה → 409 ושום דבר לא נמחק", async () => {
    findByIdMock.mockResolvedValue({ _id: "b1", folderPath: "/uploads/books/b1" });
    pathExistsMock.mockResolvedValue(true);
    cancelActiveOcrForBookMock.mockRejectedValue(new OcrApplyInProgressError("j1"));

    const res = await DELETE(makeRequest({ bookId: "b1" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "קליטת תוצאות OCR לספר זה בעיצומה — נסו שוב בעוד דקה",
      code: "apply_started",
    });
    expect(removeMock).not.toHaveBeenCalled();
    expect(pageDeleteManyMock).not.toHaveBeenCalled();
    expect(pageResultDeleteManyMock).not.toHaveBeenCalled();
    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("תקלה אחרת בביטול → 500 ושום דבר לא נמחק", async () => {
    findByIdMock.mockResolvedValue({ _id: "b1", folderPath: null });
    cancelActiveOcrForBookMock.mockRejectedValue(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await DELETE(makeRequest({ bookId: "b1" }));

    expect(res.status).toBe(500);
    expect(pageDeleteManyMock).not.toHaveBeenCalled();
    expect(pageResultDeleteManyMock).not.toHaveBeenCalled();
    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
