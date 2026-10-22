import { describe, it, expect, vi, beforeEach } from "vitest";

const { updateMany } = vi.hoisted(() => ({ updateMany: vi.fn() }));
vi.mock("@/models/OcrJob", () => ({ default: { updateMany } }));

import { reapStaleOcrJobs } from "./staleJobs";

describe("reapStaleOcrJobs", () => {
  beforeEach(() => {
    updateMany.mockReset();
    updateMany.mockResolvedValue({ modifiedCount: 0 });
  });

  it("מחריג עבודות local, נשאר מוגבל ל-running, ומשחרר את הספר (active:false)", async () => {
    await reapStaleOcrJobs();
    expect(updateMany).toHaveBeenCalledTimes(1);
    const [filter, update] = updateMany.mock.calls[0];
    expect(filter.status).toBe("running");
    expect(filter.method).toEqual({ $ne: "local" });
    expect(filter.updatedAt.$lt).toBeInstanceOf(Date);
    expect(filter.book).toBeUndefined();
    expect(update.$set.status).toBe("failed");
    expect(update.$set.active).toBe(false);
    expect(update.$set.finishedAt).toBeInstanceOf(Date);
  });

  it("מצומצם לספר אחד כשמועבר bookId", async () => {
    await reapStaleOcrJobs("507f1f77bcf86cd799439011");
    const [filter] = updateMany.mock.calls[0];
    expect(filter.book).toBe("507f1f77bcf86cd799439011");
    expect(filter.method).toEqual({ $ne: "local" });
  });
});
