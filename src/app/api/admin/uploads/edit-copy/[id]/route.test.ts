import { describe, it, expect, vi, beforeEach } from "vitest";

const { revalidateTagMock, findByIdMock, findByIdAndDeleteMock, updateManyMock, getSessionMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
  findByIdMock: vi.fn(),
  findByIdAndDeleteMock: vi.fn(),
  updateManyMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: revalidateTagMock }));
vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models/UploadEditCopy", () => ({
  default: { findById: findByIdMock, findByIdAndDelete: findByIdAndDeleteMock },
}));
vi.mock("@/models/Upload", () => ({ default: { updateMany: updateManyMock } }));
vi.mock("next-auth", () => ({ getServerSession: getSessionMock }));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }));
vi.mock("@/lib/roles", () => ({
  hasBooksAccess: (role: string) => role === "admin_books" || role === "admin",
}));

import { CACHE_TAGS } from "@/lib/cacheTags";
import { GET, PUT, DELETE } from "./route";

const ID = "64b7f0c2a1b2c3d4e5f60718";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown) => ({ json: async () => body }) as Request;

function makeCopy(fields: Record<string, unknown> = {}) {
  const copy = {
    _id: ID,
    title: "ספר",
    content: "ישן",
    history: [] as unknown[],
    sourceUploadIds: ["u1", "u2"],
    save: vi.fn().mockResolvedValue(undefined),
    ...fields,
  };
  return { ...copy, toObject: () => ({ _id: copy._id, title: copy.title, content: copy.content }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ user: { id: "admin-1", name: "מנהל", role: "admin_books" } });
});

describe("auth for /api/admin/uploads/edit-copy/[id]", () => {
  it("returns 401 without a session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(401);
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it("returns 403 for a role without books access (including admin_books_only)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u", role: "admin_books_only" } });
    for (const handler of [GET, PUT, DELETE]) {
      const res = await handler(req({ content: "x" }), ctx());
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBeTruthy();
    }
    expect(findByIdMock).not.toHaveBeenCalled();
  });
});

describe("GET", () => {
  it("returns the edit copy", async () => {
    const copy = makeCopy();
    findByIdMock.mockReturnValue({ populate: vi.fn().mockResolvedValue(copy) });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toMatchObject({ title: "ספר", content: "ישן" });
  });

  it("returns 404 for an unknown or malformed id", async () => {
    findByIdMock.mockReturnValue({ populate: vi.fn().mockResolvedValue(null) });
    expect((await GET(req(), ctx())).status).toBe(404);
    expect((await GET(req(), ctx("not-an-id"))).status).toBe(404);
  });
});

describe("PUT", () => {
  it("saves the content and records a history entry", async () => {
    const copy = makeCopy();
    findByIdMock.mockResolvedValue(copy);
    const res = await PUT(req({ content: "חדש" }), ctx());
    expect(res.status).toBe(200);
    expect(copy.content).toBe("חדש");
    expect(copy.history).toHaveLength(1);
    expect(copy.history[0]).toMatchObject({ description: "עדכון תוכן", editorId: "admin-1", editorName: "מנהל" });
    expect(copy.save).toHaveBeenCalled();
  });

  it("rejects a body without string content", async () => {
    const res = await PUT(req({ action: "claim" }), ctx());
    expect(res.status).toBe(400);
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it("returns 400, not 500, for a malformed JSON body", async () => {
    const bad = { json: async () => { throw new SyntaxError("Unexpected token"); } } as unknown as Request;
    const res = await PUT(bad, ctx());
    expect(res.status).toBe(400);
  });
});

describe("DELETE", () => {
  it("unlinks the source uploads, deletes the copy and invalidates the uploads list", async () => {
    findByIdMock.mockResolvedValue(makeCopy());
    const res = await DELETE(req(), ctx());
    expect(res.status).toBe(200);
    expect(updateManyMock).toHaveBeenCalledWith(
      { _id: { $in: ["u1", "u2"] } },
      { $unset: { editCopy: "", editCopyCreatedAt: "" } }
    );
    expect(findByIdAndDeleteMock).toHaveBeenCalledWith(ID);
    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.UPLOADS_ADMIN_LIST, { expire: 0 });
  });

  it("returns 404 and touches nothing when the copy is missing", async () => {
    findByIdMock.mockResolvedValue(null);
    const res = await DELETE(req(), ctx());
    expect(res.status).toBe(404);
    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
