import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  bookFindOne: vi.fn(),
  bookFind: vi.fn(),
  bookCreate: vi.fn(),
  bookFindByIdAndDelete: vi.fn(),
  pageFind: vi.fn(),
  pageInsertMany: vi.fn(),
  pageDeleteMany: vi.fn(),
  pageResultDeleteMany: vi.fn(),
  ensureDir: vi.fn(),
  cancelBooks: vi.fn(),
  cancelLate: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: m.revalidateTag }));
vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "admin-1", role: "admin_books", name: "מנהל ספרים" } }),
}));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/roles", () => ({
  hasBookLibraryAccess: (role: string) => role === "admin_books" || role === "admin",
}));
vi.mock("fs-extra", () => ({
  default: {
    ensureDir: m.ensureDir,
    pathExists: vi.fn().mockResolvedValue(false),
    copy: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/models/Book", () => ({
  default: {
    findOne: m.bookFindOne,
    find: m.bookFind,
    create: m.bookCreate,
    findByIdAndDelete: m.bookFindByIdAndDelete,
  },
}));
vi.mock("@/models/Page", () => ({
  default: { find: m.pageFind, insertMany: m.pageInsertMany, deleteMany: m.pageDeleteMany },
}));
vi.mock("@/models/OcrPageResult", () => ({
  default: { deleteMany: m.pageResultDeleteMany },
}));
vi.mock("@/lib/ocr/localCancel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ocr/localCancel")>();
  return { ...actual, cancelActiveOcrForBooks: m.cancelBooks, cancelLateOcrJobsQuiet: m.cancelLate };
});

import { OcrApplyInProgressError } from "@/lib/ocr/localCancel";
import { POST } from "./route";

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

const OLD = [
  { _id: "a1", name: "ספר א", folderPath: null },
  { _id: "a2", name: "ספר ב", folderPath: null },
];

describe("POST /api/admin/books/merge - ביטול OCR מתועד", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.values(m).forEach((fn) => fn.mockReset());
    m.bookFindOne.mockResolvedValue(null);
    m.bookFind.mockResolvedValue(OLD);
    m.bookCreate.mockImplementation(async (doc: Record<string, unknown>) => ({ _id: "new", ...doc, save: vi.fn() }));
    m.pageFind.mockReturnValue({ sort: async () => [] });
    m.cancelBooks.mockResolvedValue({ cancelled: [] });
    m.cancelLate.mockResolvedValue({ cancelled: [] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("מבטל את עבודות הספרים הישנים לפני יצירת הספר החדש, וסבב שני אחרי מחיקתם", async () => {
    const res = await POST(makeRequest({ bookIds: ["a1", "a2"], newName: "מאוחד" }));

    expect(res.status).toBe(200);
    const opts = { reason: "book_merged", byName: "מנהל ספרים" };
    expect(m.cancelBooks).toHaveBeenCalledWith(["a1", "a2"], opts);
    const order = m.cancelBooks.mock.invocationCallOrder[0];
    expect(order).toBeLessThan(m.ensureDir.mock.invocationCallOrder[0]);
    expect(order).toBeLessThan(m.bookCreate.mock.invocationCallOrder[0]);
    expect(order).toBeLessThan(m.pageDeleteMany.mock.invocationCallOrder[0]);
    expect(m.cancelLate).toHaveBeenCalledWith(["a1", "a2"], opts);
    const lastDelete = m.bookFindByIdAndDelete.mock.invocationCallOrder.at(-1) as number;
    expect(m.cancelLate.mock.invocationCallOrder[0]).toBeGreaterThan(lastDelete);
  });

  it("נתוני OCR מקומי (OcrPageResult) של הספרים הישנים נמחקים יחד עם העמודים שלהם", async () => {
    const res = await POST(makeRequest({ bookIds: ["a1", "a2"], newName: "מאוחד" }));

    expect(res.status).toBe(200);
    expect(m.pageResultDeleteMany.mock.calls).toEqual([[{ book: "a1" }], [{ book: "a2" }]]);
    // אחרי מחיקת העמודים של אותו ספר ולפני מחיקת רשומת הספר
    for (const i of [0, 1]) {
      const at = m.pageResultDeleteMany.mock.invocationCallOrder[i];
      expect(at).toBeGreaterThan(m.pageDeleteMany.mock.invocationCallOrder[i]);
      expect(at).toBeLessThan(m.bookFindByIdAndDelete.mock.invocationCallOrder[i]);
    }
  });

  it("קליטת תוצאות OCR בעיצומה באחד הספרים → 409 ושום דבר לא נוצר או נמחק", async () => {
    m.cancelBooks.mockRejectedValue(new OcrApplyInProgressError("j1"));

    const res = await POST(makeRequest({ bookIds: ["a1", "a2"], newName: "מאוחד" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "קליטת תוצאות OCR לספר זה בעיצומה — נסו שוב בעוד דקה",
      code: "apply_started",
    });
    expect(m.ensureDir).not.toHaveBeenCalled();
    expect(m.bookCreate).not.toHaveBeenCalled();
    expect(m.pageDeleteMany).not.toHaveBeenCalled();
    expect(m.pageResultDeleteMany).not.toHaveBeenCalled();
    expect(m.bookFindByIdAndDelete).not.toHaveBeenCalled();
    expect(m.revalidateTag).not.toHaveBeenCalled();
  });

  it("ספרים שלא נמצאו → 404 בלי לבטל דבר", async () => {
    m.bookFind.mockResolvedValue([OLD[0]]);

    const res = await POST(makeRequest({ bookIds: ["a1", "zz"], newName: "מאוחד" }));

    expect(res.status).toBe(404);
    expect(m.cancelBooks).not.toHaveBeenCalled();
  });
});
