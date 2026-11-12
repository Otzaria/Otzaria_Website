// שחזור מהאשפה (restore, batch-restore): ההעלאה חוזרת עם isDeleted: false — לא בלי השדה.
// הרשימה והמונים מסננים לפי isDeleted: false, ומסמך שהשדה נמחק ממנו ($unset) לא הופיע
// בהם יותר, וגם לא באשפה. "בטל" אחרי "מחק" במסך ההעלאות נשען על השחזור הזה.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidateTagMock, updateManyMock, findByIdAndUpdateMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  updateManyMock: vi.fn(),
  findByIdAndUpdateMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: revalidateTagMock }));
vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "admin-1", role: "admin_books" } }),
}));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/models/Upload", () => ({
  default: { updateMany: updateManyMock, findByIdAndUpdate: findByIdAndUpdateMock },
}));

import { CACHE_TAGS } from "@/lib/cacheTags";
import { PUT as batchRestore } from "./route";
import { PUT as restore } from "../restore/route";

const request = (body: unknown) => ({ json: async () => body }) as Request;
const RESTORED = { $set: { isDeleted: false }, $unset: { deletedAt: "" } };

describe("שחזור מהאשפה", () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
    updateManyMock.mockReset();
    findByIdAndUpdateMock.mockReset();
  });

  it("batch-restore: מחזיר isDeleted: false ומוחק את deletedAt", async () => {
    updateManyMock.mockResolvedValue({ modifiedCount: 2 });
    const res = await batchRestore(request({ uploadIds: ["a", "b"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, modifiedCount: 2 });
    expect(updateManyMock).toHaveBeenCalledWith({ _id: { $in: ["a", "b"] } }, RESTORED);
    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.UPLOADS_ADMIN_LIST, { expire: 0 });
  });

  it("batch-restore: בלי מזהים — 400, בלי כתיבה", async () => {
    const res = await batchRestore(request({ uploadIds: [] }));
    expect(res.status).toBe(400);
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it("restore: מחזיר isDeleted: false ומוחק את deletedAt", async () => {
    findByIdAndUpdateMock.mockResolvedValue({ _id: "a" });
    const res = await restore(request({ uploadId: "a" }));
    expect(res.status).toBe(200);
    expect(findByIdAndUpdateMock).toHaveBeenCalledWith("a", RESTORED, { returnDocument: "after" });
  });

  it("restore: העלאה שלא נמצאה — 404, בלי ריענון המטמון", async () => {
    findByIdAndUpdateMock.mockResolvedValue(null);
    const res = await restore(request({ uploadId: "missing" }));
    expect(res.status).toBe(404);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
