// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// כל מסלולי הסיום של gemini/ocrwin עוברים ב-finishJob — וחייבים לשחרר את הספר (active:false)
const { ocrJob, book, page } = vi.hoisted(() => ({
  ocrJob: { findById: vi.fn(), updateOne: vi.fn() },
  book: { findById: vi.fn() },
  page: { find: vi.fn(), findByIdAndUpdate: vi.fn(), updateOne: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models/OcrJob", () => ({ default: ocrJob }));
vi.mock("@/models/Book", () => ({ default: book }));
vi.mock("@/models/Page", () => ({ default: page }));
vi.mock("@/lib/ocr/images", () => ({ readPageImage: vi.fn(), splitImageVertically: vi.fn() }));
vi.mock("@/lib/ocr/ocrwin", () => ({ ocrwinRecognize: vi.fn() }));
vi.mock("@/lib/ocr/gemini", () => ({
  chunk: vi.fn(),
  uploadFileToGemini: vi.fn(),
  deleteUploadedFiles: vi.fn(),
  formatEditingInfo: vi.fn(),
  buildGeminiParts: vi.fn(),
  callGemini: vi.fn(),
  matchGeminiResults: vi.fn(),
}));

import { runOcrJob } from "./runOcrJob";
import { ocrwinRecognize } from "@/lib/ocr/ocrwin";
import { readPageImage } from "@/lib/ocr/images";
import { ocrTextSha256 } from "./runOcrJob.pure";

const JOB_ID = "507f1f77bcf86cd799439011";

function finishCall() {
  const call = ocrJob.updateOne.mock.calls.find(([, u]) => u?.$set && "status" in u.$set);
  return call?.[1].$set;
}

describe("runOcrJob — finishJob משחרר את הספר", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ocrJob.updateOne.mockResolvedValue({ matchedCount: 1 });
    ocrJob.findById.mockResolvedValue({
      _id: JOB_ID, status: "running", method: "ocrwin", book: "b1", existingTextMode: "overwrite",
    });
    book.findById.mockResolvedValue({ _id: "b1" });
  });

  it("ספר שלא נמצא → failed + active:false", async () => {
    book.findById.mockResolvedValue(null);
    await runOcrJob(JOB_ID);
    expect(finishCall()).toMatchObject({ status: "failed", active: false });
  });

  it("אין עמודים לעיבוד → completed + active:false", async () => {
    page.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) });
    await runOcrJob(JOB_ID);
    expect(finishCall()).toMatchObject({ status: "completed", active: false });
  });

  it("ביטול ב-ocrwin → cancelled + active:false", async () => {
    page.find.mockReturnValue({
      sort: vi.fn().mockResolvedValue([{ _id: "p1", pageNumber: 1, imagePath: "/uploads/x.jpg" }]),
    });
    // isCancelled: findById(...).select(...).lean()
    ocrJob.findById.mockImplementation(() => {
      const doc = { _id: JOB_ID, status: "running", method: "ocrwin", book: "b1", existingTextMode: "overwrite" };
      const p = Promise.resolve(doc);
      p.select = () => ({ lean: () => Promise.resolve({ cancelRequested: true }) });
      return p;
    });
    await runOcrJob(JOB_ID);
    expect(finishCall()).toMatchObject({ status: "cancelled", active: false });
  });

  it("חריגה כללית → failed + active:false", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    page.find.mockImplementation(() => { throw new Error("boom"); });
    await runOcrJob(JOB_ID);
    expect(finishCall()).toMatchObject({ status: "failed", active: false, error: "boom" });
  });
});

describe("runOcrJob — skip_edited (OCRWin)", () => {
  const T = new Date("2026-11-01T10:00:00Z");
  const OCR = "פלט ישן";
  const pages = [
    // פלט OCR שלא נגעו בו — מעובד מחדש
    { _id: "p1", pageNumber: 1, imagePath: "/uploads/1.jpg", status: "available", content: OCR, lastOcrTextSha256: ocrTextSha256(OCR), updatedAt: T },
    // נערך — מדולג
    { _id: "p2", pageNumber: 2, imagePath: "/uploads/2.jpg", status: "available", content: OCR + " מתוקן", lastOcrTextSha256: ocrTextSha256(OCR), updatedAt: T },
    // נתפס — מדולג
    { _id: "p3", pageNumber: 3, imagePath: "/uploads/3.jpg", status: "in-progress", content: OCR, lastOcrTextSha256: ocrTextSha256(OCR), updatedAt: T },
    // ריק — מעובד
    { _id: "p4", pageNumber: 4, imagePath: "/uploads/4.jpg", status: "available", content: "", updatedAt: T },
    // פלט OCR שנמחק ביד — מדולג, גם בלי revision של לקוח חדש
    { _id: "p5", pageNumber: 5, imagePath: "/uploads/5.jpg", status: "available", content: "", lastOcrTextSha256: ocrTextSha256(OCR), updatedAt: T },
    // legacy שנשמר ביד בתוך חלון 30 השניות — מדולג
    { _id: "p6", pageNumber: 6, imagePath: "/uploads/6.jpg", status: "available", content: "מתוקן", contentSaveRevision: 1, lastOcrAt: T, updatedAt: new Date(T.getTime() + 10000) },
    { _id: "p7", pageNumber: 7, imagePath: "/uploads/7.jpg", status: "available", content: "", contentSaveRevision: 1, lastOcrAt: T, updatedAt: new Date(T.getTime() + 10000) },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    ocrJob.updateOne.mockResolvedValue({ matchedCount: 1 });
    ocrJob.findById.mockImplementation(() => {
      const doc = { _id: JOB_ID, status: "running", method: "ocrwin", book: "b1", existingTextMode: "skip_edited" };
      const p = Promise.resolve(doc);
      p.select = () => ({ lean: () => Promise.resolve({ cancelRequested: false }) });
      return p;
    });
    book.findById.mockResolvedValue({ _id: "b1" });
    page.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(pages) });
    readPageImage.mockResolvedValue({ buffer: Buffer.from("x"), mimeType: "image/jpeg", ext: ".jpg" });
    ocrwinRecognize.mockResolvedValue("טקסט חדש");
  });

  it("מעבד רק עמודים שלא נערכו, בכתיבה מותנית ב-updatedAt עם טביעת הטקסט", async () => {
    page.updateOne.mockResolvedValue({ matchedCount: 1 });
    await runOcrJob(JOB_ID);

    const total = ocrJob.updateOne.mock.calls.find(([, u]) => u?.$set && "totalPages" in u.$set);
    expect(total[1].$set.totalPages).toBe(2);
    expect(page.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(page.updateOne.mock.calls.map(([f]) => f)).toEqual([
      { _id: "p1", updatedAt: T },
      { _id: "p4", updatedAt: T },
    ]);
    expect(page.updateOne.mock.calls[0][1].$set).toMatchObject({
      content: "טקסט חדש",
      lastOcrTextSha256: ocrTextSha256("טקסט חדש"),
    });
  });

  it("עמוד שנערך בזמן העבודה (העדכון המותנה לא תפס) — לא נדרס ונרשם ככשל", async () => {
    page.updateOne.mockResolvedValueOnce({ matchedCount: 0 }).mockResolvedValue({ matchedCount: 1 });
    await runOcrJob(JOB_ID);

    const failed = ocrJob.updateOne.mock.calls.find(([, u]) => u?.$push?.pageErrors);
    expect(failed[1].$push.pageErrors).toMatchObject({ pageNumber: 1, message: expect.stringMatching(/לא נדרס/) });
    expect(finishCall()).toMatchObject({ status: "completed", active: false });
  });
});
