// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// כל מסלולי הסיום של gemini/ocrwin עוברים ב-finishJob — וחייבים לשחרר את הספר (active:false)
const { ocrJob, book, page } = vi.hoisted(() => ({
  ocrJob: { findById: vi.fn(), updateOne: vi.fn() },
  book: { findById: vi.fn() },
  page: { find: vi.fn(), findByIdAndUpdate: vi.fn() },
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
