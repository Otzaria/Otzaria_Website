import { describe, it, expect, vi, beforeEach } from "vitest";

const { findByIdMock, findMock, getUploadTextMock, getSessionMock } = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  findMock: vi.fn(),
  getUploadTextMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models/UploadEditCopy", () => ({ default: { findById: findByIdMock } }));
vi.mock("@/models/Upload", () => ({ default: { find: findMock } }));
vi.mock("@/lib/gridfs-service", () => ({ getUploadText: getUploadTextMock }));
vi.mock("next-auth", () => ({ getServerSession: getSessionMock }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/roles", () => ({
  hasBooksAccess: (role: string) => role === "admin_books" || role === "admin",
}));

import { POST } from "./route";

const ID = "64b7f0c2a1b2c3d4e5f60718";
const ctx = { params: Promise.resolve({ id: ID }) };
const req = {} as Request;

function makeCopy(sourceUploadIds: string[]) {
  const copy = {
    content: "ערוך",
    history: [] as unknown[],
    sourceUploadIds,
    save: vi.fn().mockResolvedValue(undefined),
    toObject: () => ({ content: copy.content }),
  };
  return copy;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ user: { id: "admin-1", name: "מנהל", role: "admin" } });
});

describe("POST /api/admin/uploads/edit-copy/[id]/reset", () => {
  it("rebuilds the content from the non-deleted source uploads", async () => {
    const copy = makeCopy(["u1", "u2"]);
    findByIdMock.mockResolvedValue(copy);
    findMock.mockReturnValue({ sort: vi.fn().mockResolvedValue([{ id: "u1" }, { id: "u2" }]) });
    getUploadTextMock.mockResolvedValueOnce("א").mockResolvedValueOnce("ב");

    const res = await POST(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(findMock).toHaveBeenCalledWith({ _id: { $in: ["u1", "u2"] }, isDeleted: false });
    expect(data.book.content).toBe("א\n\n---\n\nב");
    expect(copy.history).toHaveLength(1);
    expect(copy.save).toHaveBeenCalled();
  });

  it("returns 404 when all source uploads were deleted", async () => {
    findByIdMock.mockResolvedValue(makeCopy(["u1"]));
    findMock.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) });
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 when the copy has no source uploads", async () => {
    findByIdMock.mockResolvedValue(makeCopy([]));
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 403 for a non-books admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u", role: "admin_ocr" } });
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
    expect(findByIdMock).not.toHaveBeenCalled();
  });
});
