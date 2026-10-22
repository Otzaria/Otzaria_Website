import { describe, it, expect, vi, beforeEach } from "vitest";

const { getServerSessionMock, findOneMock, cancelLocalJobMock, requestServerJobCancelMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  findOneMock: vi.fn(),
  cancelLocalJobMock: vi.fn(),
  requestServerJobCancelMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));

vi.mock("@/lib/roles", () => ({
  hasBookLibraryAccess: (role: string) =>
    role === "admin_books" || role === "admin" || role === "admin_books_only",
}));

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/OcrJob", () => ({
  default: { findOne: findOneMock },
}));

vi.mock("@/lib/ocr/localCancel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ocr/localCancel")>();
  return {
    ...actual,
    cancelLocalJob: cancelLocalJobMock,
    requestServerJobCancel: requestServerJobCancelMock,
  };
});

import { POST } from "./route";

const BOOK = "507f1f77bcf86cd799439011";
const JOB = "507f1f77bcf86cd799439022";

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

// OcrJob.findOne(...).select(...).lean()
function foundJob(job: unknown) {
  findOneMock.mockReturnValue({ select: () => ({ lean: async () => job }) });
}

describe("POST /api/admin/books/ocr/cancel - auth", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
  });

  // רגרסיה: לפני התיקון הראוט החזיר 401 גם למשתמש מחובר בלי הרשאה (במקום 403).
  it("returns 401 when there is no session at all", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const res = await POST(makeRequest({ bookId: BOOK }));

    expect(res.status).toBe(401);
  });

  it("returns 403 when a session exists but the role lacks access", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "user" } });

    const res = await POST(makeRequest({ bookId: BOOK }));

    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/books/ocr/cancel - ביטול", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    getServerSessionMock.mockResolvedValue({ user: { role: "admin_books", name: "מנהל ספרים" } });
    findOneMock.mockReset();
    cancelLocalJobMock.mockReset();
    requestServerJobCancelMock.mockReset();
  });

  it("מאתר עבודה פעילה לפי activeFilter (לא רק running) לפי bookId", async () => {
    foundJob({ _id: JOB, method: "local" });
    cancelLocalJobMock.mockResolvedValue({ ok: true });

    await POST(makeRequest({ bookId: BOOK }));

    const filter = findOneMock.mock.calls[0][0];
    expect(filter.book).toBe(BOOK);
    expect(filter.$or).toEqual([{ active: true }, { active: { $exists: false }, status: "running" }]);
    expect(filter.status).toBeUndefined();
  });

  it("local → 200 {success:true}, ביטול מתועד עם שם המבטל", async () => {
    foundJob({ _id: JOB, method: "local" });
    cancelLocalJobMock.mockResolvedValue({ ok: true });

    const res = await POST(makeRequest({ jobId: JOB }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(findOneMock.mock.calls[0][0]._id).toBe(JOB);
    expect(cancelLocalJobMock).toHaveBeenCalledWith(JOB, { reason: "admin", byName: "מנהל ספרים" });
    expect(requestServerJobCancelMock).not.toHaveBeenCalled();
  });

  it("local כשהקליטה כבר החלה → 409 apply_started עם הודעה בעברית", async () => {
    foundJob({ _id: JOB, method: "local" });
    cancelLocalJobMock.mockResolvedValue({ ok: false, code: "apply_started" });

    const res = await POST(makeRequest({ bookId: BOOK }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "הקליטה כבר החלה — לא ניתן לבטל", code: "apply_started" });
  });

  it("local שנסגרה בינתיים → 404", async () => {
    foundJob({ _id: JOB, method: "local" });
    cancelLocalJobMock.mockResolvedValue({ ok: false, code: "not_active" });

    const res = await POST(makeRequest({ bookId: BOOK }));

    expect(res.status).toBe(404);
  });

  it("gemini/ocrwin → ההתנהגות הקיימת: בקשת ביטול ו-200", async () => {
    foundJob({ _id: JOB, method: "ocrwin" });
    requestServerJobCancelMock.mockResolvedValue({ ok: true });

    const res = await POST(makeRequest({ bookId: BOOK }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(requestServerJobCancelMock).toHaveBeenCalledWith(JOB, { reason: "admin", byName: "מנהל ספרים" });
    expect(cancelLocalJobMock).not.toHaveBeenCalled();
  });

  it("gemini שכבר הסתיימה בין האיתור לעדכון → 404", async () => {
    foundJob({ _id: JOB, method: "gemini" });
    requestServerJobCancelMock.mockResolvedValue({ ok: false });

    const res = await POST(makeRequest({ bookId: BOOK }));

    expect(res.status).toBe(404);
  });

  it("אין עבודה פעילה → 404; מזהה לא תקין → 400", async () => {
    foundJob(null);
    expect((await POST(makeRequest({ bookId: BOOK }))).status).toBe(404);
    expect((await POST(makeRequest({ jobId: "nope" }))).status).toBe(400);
    expect((await POST(makeRequest({}))).status).toBe(400);
  });
});
