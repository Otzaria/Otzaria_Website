import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { getServerSessionMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
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

vi.mock("@/lib/ocr/staleJobs", () => ({
  reapStaleOcrJobs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/Book", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("@/models/Page", () => ({
  default: { countDocuments: vi.fn().mockResolvedValue(0) },
}));

vi.mock("@/models/OcrJob", () => ({
  default: { findOne: vi.fn(), find: vi.fn() },
}));

vi.mock("@/models/OcrWorkerState", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("@/models/OcrConflict", () => ({
  default: { countDocuments: vi.fn().mockResolvedValue(0) },
}));

import { GET } from "./route";

function makeRequest(bookId: string) {
  return { url: `http://localhost/api/admin/books/ocr/status?bookId=${bookId}` } as Request;
}

describe("GET /api/admin/books/ocr/status - auth", () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
  });

  // רגרסיה: לפני התיקון הראוט החזיר 401 גם למשתמש מחובר בלי הרשאה (במקום 403).
  it("returns 401 when there is no session at all", async () => {
    getServerSessionMock.mockResolvedValue(null);

    const res = await GET(makeRequest("507f1f77bcf86cd799439011"));

    expect(res.status).toBe(401);
  });

  it("returns 403 when a session exists but the role lacks access", async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: "user" } });

    const res = await GET(makeRequest("507f1f77bcf86cd799439011"));

    expect(res.status).toBe(403);
  });
});

// שרשרת mongoose: findOne(...).sort(...).select(...).lean() / findOne(...).select(...).lean()
function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  q.sort = vi.fn(() => q);
  q.limit = vi.fn(() => q);
  q.select = vi.fn(() => q);
  q.lean = vi.fn().mockResolvedValue(result);
  return q;
}

describe("GET /api/admin/books/ocr/status - ספק local", () => {
  const BOOK_ID = "507f1f77bcf86cd799439011";
  const JOB_ID = "64b7f0c2a1b2c3d4e5f6000a";
  type Mocked = { findOne: ReturnType<typeof vi.fn>; find: ReturnType<typeof vi.fn>; findById: ReturnType<typeof vi.fn>; countDocuments: ReturnType<typeof vi.fn> };
  let Book: Mocked, Page: Mocked, OcrJob: Mocked, OcrWorkerState: Mocked, OcrConflict: Mocked;

  beforeEach(async () => {
    vi.stubEnv("OCR_WORKER_SECRET", "s".repeat(48));
    vi.stubEnv("OCR_WORKER_ID", "worker-1");
    getServerSessionMock.mockReset();
    getServerSessionMock.mockResolvedValue({ user: { role: "admin_books" } });
    Book = (await import("@/models/Book")).default as unknown as Mocked;
    Page = (await import("@/models/Page")).default as unknown as Mocked;
    OcrJob = (await import("@/models/OcrJob")).default as unknown as Mocked;
    OcrWorkerState = (await import("@/models/OcrWorkerState")).default as unknown as Mocked;
    OcrConflict = (await import("@/models/OcrConflict")).default as unknown as Mocked;
    Book.findById.mockReturnValue(chain({ _id: BOOK_ID, name: "ספר" }));
    Page.countDocuments.mockReset();
    Page.countDocuments.mockResolvedValueOnce(10).mockResolvedValueOnce(4);
    OcrConflict.countDocuments.mockReset();
    OcrConflict.countDocuments.mockResolvedValue(3);
    OcrJob.find.mockReset();
    OcrJob.find.mockReturnValue(chain([]));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("מחזיר את כל שדות ה-local, את זמינות העובד ואת מספר ההתנגשויות הפתוחות", async () => {
    const seen = new Date(Date.now() - 30_000);
    const pageErrors = Array.from({ length: 60 }, (_, i) => ({ pageNumber: i + 1, message: `שגיאה ${i + 1}` }));
    const jobQuery = chain({
      _id: { toString: () => JOB_ID },
      status: "paused_runner",
      method: "local",
      model: "",
      existingTextMode: "skip",
      splitColumns: false,
      totalPages: 20,
      processedPages: 7,
      successPages: 0,
      failedPages: 0,
      currentPageNumber: 0,
      error: "",
      startedByName: "מנהל",
      createdAt: new Date("2026-10-20T08:00:00Z"),
      options: { lm: "rabbinic", defaultScript: "square" },
      workerState: "paused_runner",
      progressPhase: "ocr",
      progressPagesTotal: 18,
      workerMessage: "Runner paused",
      lastSeenAt: seen,
      cancelRequested: false,
      decision: null,
      pageErrors,
    });
    OcrJob.findOne.mockReturnValue(jobQuery);
    OcrWorkerState.findOne.mockReturnValue(chain({ lastSeenAt: seen }));

    const res = await GET(makeRequest(BOOK_ID));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.worker).toEqual({ configured: true, lastSeenAt: seen.toISOString(), availability: "online" });
    expect(OcrWorkerState.findOne).toHaveBeenCalledWith({ workerId: "worker-1" });
    expect(body.conflictsOpen).toBe(3);
    expect(OcrConflict.countDocuments).toHaveBeenCalledWith({ job: expect.anything(), status: { $in: ["open", "applying"] } });
    // pageMap ונתיבי קבצים לא נשלפים בכלל
    expect((jobQuery.select as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ pageMap: 0, inputPath: 0, resultPath: 0, pageErrors: { $slice: 50 } });

    expect(body.job).toMatchObject({
      id: JOB_ID,
      status: "paused_runner",
      method: "local",
      existingTextMode: "skip",
      options: { lm: "rabbinic", defaultScript: "square" },
      workerState: "paused_runner",
      progress: { phase: "ocr", pagesDone: 7, pagesTotal: 18 },
      workerMessage: "Runner paused",
      lastSeenAt: seen.toISOString(),
      cancelRequested: false,
      decision: null,
      resultOutcome: null,
      summary: { applied: 0, failed: 0, conflicts: 0, missing: 0 },
      ackAt: null,
      resumeErrorCode: null,
      resumeFailedAt: null,
      resumeFailures: 0,
      resumeRetryAt: null,
      cancelReason: null,
      cancelledByName: null,
    });
    expect(body.job.pageErrors).toHaveLength(50);
    expect(body.job).not.toHaveProperty("inputPath");
    expect(body.job).not.toHaveProperty("pageMap");
  });

  it("עובד שלא פנה מעולם / תצורה חסרה; עבודת ocrwin לא סופרת התנגשויות", async () => {
    OcrJob.findOne.mockReturnValue(chain({ _id: { toString: () => JOB_ID }, status: "completed", method: "ocrwin", totalPages: 5 }));
    OcrWorkerState.findOne.mockReturnValue(chain(null));

    const body = await (await GET(makeRequest(BOOK_ID))).json();
    expect(body.worker).toEqual({ configured: true, lastSeenAt: null, availability: "never" });
    // conflictsOpen — של העבודה המוחזרת בלבד (ocrwin → 0); הספירה ברמת הספר בשדה נפרד
    expect(body.conflictsOpen).toBe(0);
    expect(OcrConflict.countDocuments).not.toHaveBeenCalledWith({ job: expect.anything(), status: expect.anything() });
    expect(body.bookConflictsOpen).toBe(3);
    expect(OcrConflict.countDocuments).toHaveBeenCalledWith({ book: BOOK_ID, status: { $in: ["open", "applying"] } });
    expect(body.job.progress).toEqual({ phase: null, pagesDone: 0, pagesTotal: 5 });

    vi.stubEnv("OCR_WORKER_SECRET", "");
    Page.countDocuments.mockResolvedValueOnce(10).mockResolvedValueOnce(4);
    const noCfg = await (await GET(makeRequest(BOOK_ID))).json();
    expect(noCfg.worker).toEqual({ configured: false, lastSeenAt: null, availability: "never" });
  });

  it("תוצאות מתנגשות ונדחות מוחזרות בלי נתיבי קבצים", async () => {
    const at = new Date("2026-10-20T09:00:00Z");
    const jobQuery = chain({
      _id: { toString: () => JOB_ID },
      status: "completed",
      method: "local",
      totalPages: 3,
      resultConflicts: [{ sha256: "a".repeat(64), receivedAt: at, bytes: 120, path: "x/rejected-a.json", reviewedAt: null }],
      resultRejections: [{ sha256: "b".repeat(64), receivedAt: at, bytes: 9, path: "x/rejected-b.json", reason: "validation_failed", details: "pages[0]: missing" }],
    });
    OcrJob.findOne.mockReturnValue(jobQuery);
    OcrWorkerState.findOne.mockReturnValue(chain(null));

    const body = await (await GET(makeRequest(BOOK_ID))).json();
    expect((jobQuery.select as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      "resultConflicts.path": 0,
      "resultRejections.path": 0,
    });
    expect(body.job.resultConflicts).toEqual([
      { sha256: "a".repeat(64), receivedAt: at.toISOString(), bytes: 120, reviewedAt: null, reviewedByName: "" },
    ]);
    expect(body.job.resultRejections).toEqual([
      { sha256: "b".repeat(64), receivedAt: at.toISOString(), bytes: 9, reason: "validation_failed", details: "pages[0]: missing" },
    ]);
  });

  it("עבודת local בהכנה: requestId ו-preparingStale לפי ה-lease (בלי נתיבים); עבודה אחרת — null/false", async () => {
    OcrWorkerState.findOne.mockReturnValue(chain(null));
    const base = { _id: { toString: () => JOB_ID }, method: "local", status: "preparing", totalPages: 0, requestId: "req-12345678" };

    OcrJob.findOne.mockReturnValue(chain({ ...base, prepLeaseUntil: new Date(Date.now() - 1000) }));
    const stale = await (await GET(makeRequest(BOOK_ID))).json();
    expect(stale.job).toMatchObject({ requestId: "req-12345678", preparingStale: true });

    Page.countDocuments.mockResolvedValueOnce(10).mockResolvedValueOnce(4);
    const until = new Date(Date.now() + 60_000);
    OcrJob.findOne.mockReturnValue(chain({ ...base, prepLeaseUntil: until }));
    const fresh = await (await GET(makeRequest(BOOK_ID))).json();
    expect(fresh.job).toMatchObject({ requestId: "req-12345678", preparingStale: false, prepLeaseUntil: until.toISOString() });

    Page.countDocuments.mockResolvedValueOnce(10).mockResolvedValueOnce(4);
    OcrJob.findOne.mockReturnValue(chain({ ...base, status: "queued", prepLeaseUntil: null }));
    const queued = await (await GET(makeRequest(BOOK_ID))).json();
    expect(queued.job).toMatchObject({ requestId: null, preparingStale: false, prepLeaseUntil: null });
  });

  it("עובד שלא פנה יותר משתי דקות → offline", async () => {
    OcrJob.findOne.mockReturnValue(chain(null));
    OcrWorkerState.findOne.mockReturnValue(chain({ lastSeenAt: new Date(Date.now() - 10 * 60_000) }));
    const body = await (await GET(makeRequest(BOOK_ID))).json();
    expect(body.job).toBeNull();
    expect(body.worker.availability).toBe("offline");
  });

  it("נתוני התוצאה: pipelineVersion, resultError, layoutSummary, pageErrors[].code ו-resultMetadata (תת-קבוצה), בלי resultMetadataJson", async () => {
    const meta = {
      hardware: { device: "cuda:0", gpu: "AMD Radeon RX 9060 XT", cpu_logical: 16 },
      models: { detector: "d" }, run_seconds: 61.2, otzaria_issues: 1,
      otzaria_issue_list: Array.from({ length: 60 }, (_, i) => `שורה ${i}`),
      layout: { version: 1, pages: 2, trimmed: 0, dropped: 1, bytes: 3066 },
      salvage: { reason: "cancelled", pages: 3 }, service_version: "1.0.143", bridge_version: 2,
      per_page: 18.9, seconds: { layout: 1 },
    };
    OcrJob.findOne.mockReturnValue(chain({
      _id: { toString: () => JOB_ID }, status: "completed", method: "local", totalPages: 4,
      pipelineVersion: "ocr-torani 0.1.0", resultError: { code: "gpu_lost", message: "failed after 3 attempts" },
      layoutSummary: { ok: 2, absent: 0, dropped: 1 }, resultMetadataJson: JSON.stringify(meta),
      pageErrors: [{ pageNumber: 14, code: "not_processed", message: "שגיאת OCR" }, { pageNumber: 15, message: "ישן" }],
    }));
    OcrWorkerState.findOne.mockReturnValue(chain(null));
    const body = await (await GET(makeRequest(BOOK_ID))).json();
    expect(body.job.pipelineVersion).toBe("ocr-torani 0.1.0");
    expect(body.job.resultError).toEqual({ code: "gpu_lost", message: "failed after 3 attempts" });
    expect(body.job.layoutSummary).toEqual({ ok: 2, absent: 0, dropped: 1 });
    expect(body.job.pageErrors).toEqual([
      { pageNumber: 14, code: "not_processed", message: "שגיאת OCR" },
      { pageNumber: 15, code: null, message: "ישן" },
    ]);
    expect(body.job.resultMetadata).toEqual({
      hardware: { gpu: "AMD Radeon RX 9060 XT" }, models: { detector: "d" }, run_seconds: 61.2, otzaria_issues: 1,
      otzaria_issue_list: meta.otzaria_issue_list.slice(0, 50), layout: meta.layout, salvage: meta.salvage,
      service_version: "1.0.143", bridge_version: 2,
    });
    expect(body.job).not.toHaveProperty("resultMetadataJson");
  });

  it("עבודה בלי נתוני תוצאה חדשים (לפני השדרוג) → null בשדות החדשים", async () => {
    OcrJob.findOne.mockReturnValue(chain({ _id: { toString: () => JOB_ID }, status: "completed", method: "local", totalPages: 2 }));
    OcrWorkerState.findOne.mockReturnValue(chain(null));
    const body = await (await GET(makeRequest(BOOK_ID))).json();
    expect(body.job).toMatchObject({ pipelineVersion: null, resultError: null, layoutSummary: null, resultMetadata: null });
  });
});
